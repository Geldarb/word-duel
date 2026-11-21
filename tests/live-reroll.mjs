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
  const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 20000 });
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

function waitFor(socket, pred, label, ms = 20000) {
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

async function main() {
  const health = await fetch(`${URL}/healthz`).then((r) => r.text());
  if (!health.includes('v0.6')) {
    throw new Error(`expected /healthz to mention v0.6, got ${health.trim()}`);
  }
  console.log('health', health.trim());

  const ada = await connect('Ada');
  const bea = await connect('Bea');
  const created = await emit(ada, 'createRoom', {
    name: 'LiveAda',
    testSecret: TEST_SECRET || undefined,
    turnSeconds: TEST_SECRET ? 45 : undefined,
  });
  if (!created?.ok) throw new Error(`createRoom: ${JSON.stringify(created)}`);
  const joined = await emit(bea, 'joinRoom', { name: 'LiveBea', code: created.code });
  if (!joined?.ok) throw new Error(`joinRoom: ${JSON.stringify(joined)}`);

  await waitFor(ada, (s) => s?.status === 'playing' && s.current, 'first turn', 30000);
  await waitFor(bea, (s) => s?.status === 'playing' && s.current, 'first turn bea', 30000);

  const first = ada.state.current.yours ? ada : bea;
  const second = first === ada ? bea : ada;
  const endsAt = first.state.current.endsAt;
  const before = first.state.current.letters.join('');
  const scrambleId = first.state.current.scrambleId || 0;

  const denied = await emit(second, 'reroll', { token: second.state.you.token });
  if (!denied?.error) throw new Error('opponent should not be able to reroll');

  const rolled = await emit(first, 'reroll', { token: first.state.you.token });
  if (!rolled?.ok) throw new Error(`reroll failed: ${JSON.stringify(rolled)}`);
  await waitFor(first, (s) => (s?.current?.scrambleId || 0) > scrambleId, 'letters changed');
  await waitFor(second, (s) => s?.lastReroll && s.lastReroll.yours === false, 'partner note');

  if (first.state.you.rerollsLeft !== 2) throw new Error(`expected 2 rerolls left, got ${first.state.you.rerollsLeft}`);
  if (second.state.opponent.rerollsLeft !== 2) throw new Error('partner did not see updated count');
  if (first.state.current.endsAt !== endsAt) throw new Error(`timer reset: ${endsAt} -> ${first.state.current.endsAt}`);
  if (first.state.current.letters.join('') === before) {
    console.warn('new scramble happened to match the old letters');
  }
  const word = findValid(first.state.current.letters);
  if (!word) throw new Error(`no valid word in ${first.state.current.letters.join('')}`);
  const hint = await emit(first, 'checkWord', { word, token: first.state.you.token });
  if (!hint?.ok || !hint.valid) throw new Error(`checkWord after reroll: ${JSON.stringify(hint)} for ${word}`);

  const again = await emit(first, 'reroll', { token: first.state.you.token });
  if (!again?.ok) throw new Error(`second reroll failed: ${JSON.stringify(again)}`);
  await waitFor(first, (s) => s?.you?.rerollsLeft === 1, 'second reroll same turn');

  ada.close();
  bea.close();
  console.log('PASS live reroll', created.code, first.name, 'kept timer, partner saw 🎲 rerolled!, hint still works');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
