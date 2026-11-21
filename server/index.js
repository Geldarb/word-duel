import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { loadDictionary, loadSlang, dictionarySize, slangSize, listSlang } from './dictionary.js';
import { loadCommon, commonSize } from './crossword.js';
import { RoomManager, VERSION, EMOJIS, DEFAULT_TURN_SECONDS } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const wordCount = loadDictionary();
const slangCount = loadSlang();
const commonCount = loadCommon();
console.log(`Word Duel ${VERSION} loaded ${wordCount} words, ${slangCount} slang, ${commonCount} common`);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 25000,
});

const manager = new RoomManager({
  turnSeconds: Number(process.env.TURN_SECONDS) || DEFAULT_TURN_SECONDS,
  testSecret: process.env.TEST_SECRET || '',
  onEmit(room) {
    for (const player of [room.players.p1, room.players.p2]) {
      if (player?.socketId) {
        io.to(player.socketId).emit('state', manager.serialize(room, player.id));
      }
    }
  },
  onReaction(room, payload) {
    for (const player of [room.players.p1, room.players.p2]) {
      if (player?.socketId) {
        io.to(player.socketId).emit('reaction', {
          emoji: payload.emoji,
          fromId: payload.fromId,
          fromName: payload.fromName,
          mine: player.id === payload.fromId,
        });
      }
    }
  },
});

app.get('/healthz', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain').send(`ok ${VERSION}`);
});

app.get('/api/slang', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ words: listSlang() });
});

app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

function ackError(cb, message) {
  if (typeof cb === 'function') cb({ error: message });
}

io.on('connection', (socket) => {
  socket.emit('hello', { version: VERSION, emojis: EMOJIS });

  socket.on('createRoom', (payload = {}, cb) => {
    try {
      const { room, player } = manager.createRoom({
        name: payload.name,
        token: payload.token,
        testSecret: payload.testSecret,
        turnSeconds: payload.turnSeconds,
        fillSeconds: payload.fillSeconds,
        funMode: payload.funMode,
        mode: payload.mode,
        storyLength: payload.storyLength,
        raceSize: payload.raceSize,
        puzzleSeed: payload.puzzleSeed,
        socketId: socket.id,
      });
      if (typeof cb === 'function') {
        cb({ ok: true, token: player.token, playerId: player.id, code: room.code });
      }
    } catch (err) {
      console.error('createRoom', err);
      ackError(cb, 'Could not create a room.');
    }
  });

  socket.on('joinRoom', (payload = {}, cb) => {
    try {
      const result = manager.joinRoom({
        code: payload.code,
        name: payload.name,
        token: payload.token,
        socketId: socket.id,
      });
      if (result.error) return ackError(cb, result.error);
      if (typeof cb === 'function') {
        cb({
          ok: true,
          token: result.player.token,
          playerId: result.player.id,
          code: result.room.code,
        });
      }
    } catch (err) {
      console.error('joinRoom', err);
      ackError(cb, 'Could not join that room.');
    }
  });

  socket.on('resume', (payload = {}, cb) => {
    try {
      const result = manager.resume({
        token: payload.token,
        name: payload.name,
        socketId: socket.id,
      });
      if (result.error) return ackError(cb, result.error);
      if (typeof cb === 'function') {
        cb({
          ok: true,
          token: result.player.token,
          playerId: result.player.id,
          code: result.room.code,
          resumed: true,
        });
      }
    } catch (err) {
      console.error('resume', err);
      ackError(cb, 'Could not reconnect.');
    }
  });

  socket.on('submitWord', (payload = {}, cb) => {
    const result = manager.submitWord(socket.id, payload.word, payload.tiles);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('submitRaceWord', (payload = {}, cb) => {
    const result = manager.submitRaceWord(socket.id, payload.word);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true, result: result.result, word: result.word });
  });

  socket.on('submitStory', (payload = {}, cb) => {
    const result = manager.submitStory(socket.id, payload.answers);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('voteStory', (payload = {}, cb) => {
    const result = manager.voteStory(socket.id, payload.key);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('checkWord', (payload = {}, cb) => {
    const result = manager.checkWord(socket.id, payload.word, payload.token);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true, word: result.word, valid: !!result.valid, slang: !!result.slang });
  });

  socket.on('reroll', (payload = {}, cb) => {
    const result = manager.reroll(socket.id, payload.token);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('react', (payload = {}, cb) => {
    const result = manager.react(socket.id, payload.emoji);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('rematch', (_payload, cb) => {
    const result = manager.rematch(socket.id);
    if (result?.error) return ackError(cb, result.error);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('leave', (_payload, cb) => {
    manager.disconnect(socket.id);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('leaveRoom', (payload = {}, cb) => {
    if (payload.token) manager.leaveByToken(payload.token);
    else manager.disconnect(socket.id);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('disconnect', () => {
    manager.disconnect(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Word Duel ${VERSION} listening on ${PORT} (${dictionarySize()} words, ${slangSize()} slang, ${commonSize()} common)`);
});
