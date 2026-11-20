import { io } from 'socket.io-client';
import { loadCommon, subwordsFor } from '../server/crossword.js';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const TEST_SECRET = process.env.TEST_SECRET || '';

function connect(name) {
  const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 20000,
  });
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
      if (res?.error) reject(new Error(`${event}: ${res.error}`));
      else resolve(res);
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
      reject(new Error(`timeout waiting for ${label} (status=${socket.state?.status})`));
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('state', onState);
    };
    socket.on('state', onState);
    if (socket.state && pred(socket.state)) {
      cleanup();
      resolve(socket.state);
    }
  });
}

async function main() {
  console.log('Live Crossword Race test against', URL);
  loadCommon();
  const health = await fetch(`${URL}/healthz`).then((r) => r.text());
  console.log('healthz', health.trim());
  if (!health.includes('v0.5')) {
    throw new Error(`expected /healthz to mention v0.5, got ${health.trim()}`);
  }

  const ada = await connect('Ada');
  const bea = await connect('Bea');
  const created = await emit(ada, 'createRoom', {
    name: 'Ada',
    mode: 'race',
    raceSize: 'small',
    testSecret: TEST_SECRET || undefined,
    puzzleSeed: TEST_SECRET ? 42 : undefined,
  });
  const code = created.code;
  console.log('room', code);
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await waitFor(ada, (s) => s.status === 'racing' && s.race, 'ada racing');
  await waitFor(bea, (s) => s.status === 'racing' && s.race, 'bea racing');

  const letters = ada.state.race.letters;
  if (JSON.stringify(letters) !== JSON.stringify(bea.state.race.letters)) {
    throw new Error('players were dealt different wheels');
  }
  if (ada.state.race.total !== bea.state.race.total) {
    throw new Error('players were dealt different grids');
  }
  const candidates = subwordsFor(letters);
  if (candidates.length < ada.state.race.total) {
    throw new Error(`not enough subwords from ${letters.join('')} to fill the grid`);
  }

  // Bea finds the first accepted grid word, Ada must see only a progress count.
  let beaWord = null;
  for (const word of candidates) {
    const res = await emit(bea, 'submitRaceWord', { word });
    if (res.result === 'found') {
      beaWord = res.word;
      break;
    }
  }
  if (!beaWord) throw new Error('Bea could not find a grid word');
  await waitFor(ada, (s) => s.race?.opponentCount === 1, 'ada sees Bea progress');
  const adaJson = JSON.stringify(ada.state);
  if (adaJson.includes(beaWord)) {
    throw new Error(`Ada's state leaked Bea's word ${beaWord}`);
  }
  if (ada.state.race.youCount !== 0) throw new Error('Ada should still be on 0 words');

  // Ada finishes the puzzle.
  for (const word of candidates) {
    if (ada.state.status === 'ended') break;
    await emit(ada, 'submitRaceWord', { word });
  }
  await waitFor(ada, (s) => s.status === 'ended' && s.winnerId === 'p1', 'Ada wins');
  await waitFor(bea, (s) => s.status === 'ended' && s.winnerId === 'p1', 'Bea sees the loss');

  if (ada.state.you.score !== ada.state.race.total) {
    throw new Error(`Ada score ${ada.state.you.score} != total ${ada.state.race.total}`);
  }
  if (bea.state.you.score !== 1) {
    throw new Error(`Bea should still have 1 word, got ${bea.state.you.score}`);
  }
  if (!bea.state.race.slots.every((slot) => slot.found && slot.word)) {
    throw new Error('end screen should reveal the full grid');
  }
  console.log(`Ada won ${ada.state.you.score}-${bea.state.you.score} in ${ada.state.race.elapsedMs}ms`);

  ada.close();
  bea.close();
  console.log('Live Crossword Race test passed');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
