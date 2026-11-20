import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { loadDictionary, isValidWord } from '../server/dictionary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 31000 + Math.floor(Math.random() * 500);
const URL = `http://127.0.0.1:${PORT}`;
const SECRET = 'hint-client-test';

function findValid(letters) {
  const chars = letters.map((c) => String(c).toUpperCase());
  let best = '';
  const used = Array(chars.length).fill(false);
  function rec(cur) {
    if (cur.length >= 2 && isValidWord(cur) && cur.length > best.length) best = cur;
    if (cur.length >= 5 || (best.length >= 4 && cur.length >= 4)) return;
    for (let i = 0; i < chars.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      rec(cur + chars[i]);
      used[i] = false;
    }
  }
  rec('');
  return best;
}

function connect(name) {
  const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 20000 });
  socket.name = name;
  socket.state = null;
  socket.on('state', (s) => { socket.state = s; });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name} connect timeout`)), 20000);
    socket.once('connect', () => { clearTimeout(t); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(t); reject(err); });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} timeout`)), 10000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor(socket, pred, label, ms = 12000) {
  return new Promise((resolve, reject) => {
    const onState = (s) => {
      socket.state = s;
      if (pred(s)) {
        cleanup();
        resolve(s);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout ${label} status=${socket.state?.status}`));
    }, ms);
    const cleanup = () => { clearTimeout(timer); socket.off('state', onState); };
    socket.on('state', onState);
    if (socket.state && pred(socket.state)) {
      cleanup();
      resolve(socket.state);
    }
  });
}

async function startServer() {
  const child = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), TEST_SECRET: SECRET },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 15000);
    const onData = (buf) => {
      if (String(buf).includes('listening')) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.off('exit', onExit);
        resolve();
      }
    };
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}`));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (b) => process.stderr.write(b));
    child.once('exit', onExit);
  });
  return child;
}

describe('checkWord for creator, joiner, and resume', () => {
  let server;

  before(async () => {
    loadDictionary();
    server = await startServer();
  });

  after(() => {
    if (server) server.kill('SIGTERM');
  });

  it('returns valid for both players on their turns, including a resumed socket', async () => {
    const ada = await connect('Ada');
    const bea = await connect('Bea');
    const created = await emit(ada, 'createRoom', {
      name: 'Ada',
      testSecret: SECRET,
      turnSeconds: 45,
    });
    assert.equal(created.ok, true);
    const joined = await emit(bea, 'joinRoom', { name: 'Bea', code: created.code });
    assert.equal(joined.ok, true);

    await waitFor(ada, (s) => s?.status === 'playing' && s.current, 'first turn');
    await waitFor(bea, (s) => s?.status === 'playing' && s.current, 'first turn bea');

    async function assertHint(socket, label) {
      const letters = socket.state.current.letters;
      const word = findValid(letters);
      assert.ok(word, `${label}: no valid word in ${letters.join('')}`);
      const res = await emit(socket, 'checkWord', { word, token: socket.state.you.token });
      assert.equal(res.ok, true, `${label}: ${JSON.stringify(res)}`);
      assert.equal(res.valid, true, `${label}: expected valid for ${word}, got ${JSON.stringify(res)}`);
      assert.equal(res.word, word);
      return word;
    }

    const first = ada.state.current.yours ? ada : bea;
    const second = first === ada ? bea : ada;
    const firstWord = await assertHint(first, `${first.name} first turn`);

    // Resume the active player on a fresh socket (page refresh).
    const token = first.state.you.token;
    const name = first.name;
    first.disconnect();
    first.close();
    const resumed = await connect(`${name}-resumed`);
    const resumeRes = await emit(resumed, 'resume', { token, name });
    assert.equal(resumeRes.ok, true);
    await waitFor(resumed, (s) => s?.status === 'playing' && s.current?.yours && !s.current.paused, 'resumed turn');
    await assertHint(resumed, `${name} after resume`);

    const submitted = await emit(resumed, 'submitWord', { word: firstWord, token });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    await waitFor(second, (s) => s?.status === 'playing' && s.current?.yours, 'second player turn', 10000);
    await assertHint(second, `${second.name} own turn`);

    // Resume the second player too.
    const token2 = second.state.you.token;
    const name2 = second.name;
    second.disconnect();
    second.close();
    const resumed2 = await connect(`${name2}-resumed`);
    const resumeRes2 = await emit(resumed2, 'resume', { token: token2, name: name2 });
    assert.equal(resumeRes2.ok, true);
    await waitFor(resumed2, (s) => s?.status === 'playing' && s.current?.yours && !s.current.paused, 'second resumed');
    await assertHint(resumed2, `${name2} after resume`);

    ada.close();
    bea.close();
    resumed.close();
    resumed2.close();
  });
});
