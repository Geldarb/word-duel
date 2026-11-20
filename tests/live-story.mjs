import { io } from 'socket.io-client';

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

function assertHidden(state, forbidden) {
  const json = JSON.stringify(state);
  for (const word of forbidden) {
    if (json.includes(word)) throw new Error(`state leaked opponent answer "${word}"`);
  }
}

async function main() {
  console.log('Live Story Duel test against', URL);
  const health = await fetch(`${URL}/healthz`).then((r) => r.text());
  console.log('healthz', health.trim());
  if (!health.includes('v0.4')) {
    throw new Error(`expected /healthz to mention v0.4, got ${health.trim()}`);
  }

  const ada = await connect('Ada');
  const bea = await connect('Bea');
  const created = await emit(ada, 'createRoom', {
    name: 'Ada',
    mode: 'story',
    storyLength: 5,
    testSecret: TEST_SECRET || undefined,
    fillSeconds: TEST_SECRET ? 20 : undefined,
  });
  const code = created.code;
  console.log('room', code);
  await emit(bea, 'joinRoom', { name: 'Bea', code });

  const filling = await waitFor(ada, (s) => s?.status === 'filling' && s.story?.blanks?.length === 5, 'fill phase');
  await waitFor(bea, (s) => s?.status === 'filling', 'bea fill');
  if (filling.mode !== 'story') throw new Error('mode was not story');
  if (filling.story.blanks.length !== 5) throw new Error('expected 5 blanks');
  console.log('story blanks', filling.story.blanks.map((b) => b.prompt).join(', '));

  const adaAnswers = filling.story.blanks.map((_, i) => `AdaSecret${i}`);
  const beaAnswers = filling.story.blanks.map((_, i) => `BeaSecret${i}`);
  await emit(ada, 'submitStory', { answers: adaAnswers });
  const afterAda = await waitFor(bea, (s) => s?.story?.opponentSubmitted === true, 'bea sees ada submitted');
  assertHidden(afterAda, adaAnswers);
  if (afterAda.status !== 'filling') throw new Error('reveal started before Bea submitted');

  await emit(bea, 'submitStory', { answers: beaAnswers });
  const revealA = await waitFor(ada, (s) => s?.status === 'revealing' && s.story?.currentLine, 'reveal');
  const revealB = await waitFor(bea, (s) => s?.status === 'revealing' && s.story?.currentLine, 'bea reveal');
  if (revealA.story.currentLine.versions.some((v) => v.playerId || v.yours || v.name)) {
    throw new Error('versions were not anonymous at the start of voting');
  }
  if (revealA.story.currentLine.versions.map((v) => v.text).join('|')
    !== revealB.story.currentLine.versions.map((v) => v.text).join('|')) {
    throw new Error('players saw different version order');
  }

  const lineCount = revealA.story.lineCount;
  console.log('vote lines', lineCount);
  for (let i = 0; i < lineCount; i++) {
    await waitFor(ada, (s) => s?.status === 'revealing' && s.story?.lineIndex === i && s.story?.subphase === 'vote', `line ${i} vote`);
    await emit(ada, 'voteStory', { key: 'peach' });
    await emit(bea, 'voteStory', { key: i % 2 === 0 ? 'peach' : 'blossom' });
    const authors = await waitFor(ada, (s) => s?.story?.subphase === 'authors' && s.story?.lineIndex === i, `line ${i} authors`);
    if (authors.story.currentLine.versions.some((v) => !v.name && v.yours == null)) {
      throw new Error('authors were not revealed after the votes');
    }
    console.log(`  line ${i} tally`, authors.story.tally, 'scores', authors.you.score, authors.opponent.score);
  }

  const ended = await waitFor(ada, (s) => s?.status === 'ended', 'ended', 8000);
  await waitFor(bea, (s) => s?.status === 'ended', 'bea ended', 5000);
  if (!ended.story?.fullStories?.you || !ended.story?.fullStories?.opponent) {
    throw new Error('end screen was missing the two full stories');
  }
  if (!ended.story.fullStories.you.includes('AdaSecret0')) {
    throw new Error('Ada story missing her answers');
  }
  console.log('ended', ended.you.score, 'vs', ended.opponent.score);
  if (ended.you.score + ended.opponent.score !== lineCount * 2) {
    throw new Error(`vote points did not add up: ${ended.you.score}+${ended.opponent.score}`);
  }

  ada.close();
  bea.close();
  console.log('PASS story duel');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
