import { io } from 'socket.io-client';
import { loadDictionary, isValidWord } from '../server/dictionary.js';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const TEST_SECRET = process.env.TEST_SECRET || '';

loadDictionary();

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
  const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 25000 });
  socket.name = name;
  socket.state = null;
  socket.on('state', (s) => { socket.state = s; });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name} connect timeout`)), 45000);
    socket.once('connect', () => { clearTimeout(t); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(t); reject(err); });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor(socket, pred, label, ms = 15000) {
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

async function assertCheck(socket, label) {
  const letters = socket.state.current.letters;
  const word = findValid(letters);
  if (!word) throw new Error(`${label}: no valid word in ${letters.join('')}`);
  const res = await emit(socket, 'checkWord', { word, token: socket.state.you.token });
  if (!res?.ok || !res.valid || res.word !== word) {
    throw new Error(`${label}: expected valid ${word}, got ${JSON.stringify(res)}`);
  }
  console.log(`  ${label}: ${word} valid`);
  return word;
}

async function main() {
  console.log('Live checkWord test against', URL);
  const ada = await connect('Ada');
  const bea = await connect('Bea');
  const created = await emit(ada, 'createRoom', {
    name: 'Ada-test',
    testSecret: TEST_SECRET || undefined,
    turnSeconds: TEST_SECRET ? 30 : undefined,
  });
  if (!created?.ok) throw new Error(`createRoom failed ${JSON.stringify(created)}`);
  const joined = await emit(bea, 'joinRoom', { name: 'Bea-test', code: created.code });
  if (!joined?.ok) throw new Error(`joinRoom failed ${JSON.stringify(joined)}`);
  console.log('room', created.code);

  await waitFor(ada, (s) => s?.status === 'playing' && s.current, 'first turn');
  await waitFor(bea, (s) => s?.status === 'playing' && s.current, 'first turn bea');
  const first = ada.state.current.yours ? ada : bea;
  const second = first === ada ? bea : ada;

  const firstWord = await assertCheck(first, `${first.name} first turn`);

  const token = first.state.you.token;
  const name = first.name;
  first.disconnect();
  first.close();
  const resumed = await connect(`${name}-resumed`);
  const resumeRes = await emit(resumed, 'resume', { token, name });
  if (!resumeRes?.ok) throw new Error(`resume failed ${JSON.stringify(resumeRes)}`);
  await waitFor(resumed, (s) => s?.status === 'playing' && s.current?.yours && !s.current.paused, 'resumed turn');
  await assertCheck(resumed, `${name} after resume`);

  const submitted = await emit(resumed, 'submitWord', { word: firstWord });
  if (!submitted?.ok) throw new Error(`submit failed ${JSON.stringify(submitted)}`);
  await waitFor(second, (s) => s?.status === 'playing' && s.current?.yours, 'second turn', 10000);
  await assertCheck(second, `${second.name} own turn`);

  // Leave the test room so it does not linger.
  await emit(resumed, 'leaveRoom', { token });
  await emit(second, 'leaveRoom', { token: second.state.you.token });
  ada.close();
  bea.close();
  resumed.close();
  second.close();
  console.log('PASS live checkWord for creator, joiner, and resume');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
