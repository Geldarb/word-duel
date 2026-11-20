import { randomInt, randomUUID } from 'node:crypto';
import { isValidWord, isSlangWord } from './dictionary.js';

export const VERSION = 'v0.3.1';
export const TURNS_EACH = 6;
export const TOTAL_TURNS = TURNS_EACH * 2;
export const MIN_WORD_LEN = 2;
export const LETTER_COUNT = 7;
export const DEFAULT_TURN_SECONDS = 60;
export const INTERMISSION_MS = 2800;
export const ROOM_TTL_MS = 15 * 60 * 1000;
export const REACTION_MIN_INTERVAL_MS = 900;
export const CHECK_WORD_MIN_INTERVAL_MS = 150;
export const SLANG_BONUS = 2;

export const LETTER_VALUES = Object.freeze({
  A: 1, E: 1, I: 1, O: 1, N: 1, R: 1, S: 1, T: 1,
  L: 2, U: 2, D: 2,
  C: 3, G: 3, M: 3, H: 3, P: 3,
  B: 4, F: 4, W: 4, Y: 4,
  K: 5, V: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
});

export const LETTER_FREQ = Object.freeze({
  A: 82, B: 15, C: 28, D: 43, E: 127, F: 22, G: 20, H: 61,
  I: 70, J: 2, K: 8, L: 40, M: 24, N: 67, O: 75, P: 19,
  Q: 1, R: 60, S: 63, T: 91, U: 28, V: 10, W: 24, X: 2,
  Y: 20, Z: 1,
});

export const VOWELS = Object.freeze(['A', 'E', 'I', 'O', 'U']);
export const EMOJIS = Object.freeze(['😍', '😂', '😮', '👏', '🔥', '😭', '😘', '🙈']);

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ALL_LETTERS = Object.freeze(Object.keys(LETTER_FREQ));

export function generateCode(existing) {
  for (let len = 4; len <= 6; len++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < len; i++) {
        code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      }
      if (!existing || !existing.has(code)) return code;
    }
  }
  return randomUUID().replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
}

export function pickWeighted(letters, weights, rng = Math.random) {
  let total = 0;
  for (const letter of letters) total += weights[letter];
  let roll = rng() * total;
  for (const letter of letters) {
    roll -= weights[letter];
    if (roll <= 0) return letter;
  }
  return letters[letters.length - 1];
}

export function shuffleInPlace(items, randInt = randomInt) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function generateScramble() {
  const letters = [];
  for (let i = 0; i < 2; i++) letters.push(pickWeighted(VOWELS, LETTER_FREQ));
  for (let i = 0; i < LETTER_COUNT - 2; i++) letters.push(pickWeighted(ALL_LETTERS, LETTER_FREQ));
  return shuffleInPlace(letters);
}

export function vowelCount(letters) {
  return letters.filter((ch) => VOWELS.includes(ch)).length;
}

export function canForm(word, letters) {
  const bag = Object.create(null);
  for (const letter of letters) bag[letter] = (bag[letter] || 0) + 1;
  for (const ch of String(word).toUpperCase()) {
    if (!bag[ch]) return false;
    bag[ch] -= 1;
  }
  return true;
}

export function scoreWord(word) {
  let total = 0;
  for (const ch of String(word).toUpperCase()) {
    total += LETTER_VALUES[ch] || 0;
  }
  return total;
}

export function sanitiseName(name) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return cleaned || 'Player';
}

export function sanitiseWord(word) {
  return String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
}

export function judgeWord(word, letters, { funMode = false } = {}) {
  const cleaned = sanitiseWord(word);
  if (cleaned.length < MIN_WORD_LEN) {
    return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false };
  }
  if (!canForm(cleaned, letters)) {
    return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false };
  }
  if (isValidWord(cleaned)) {
    return { valid: true, word: cleaned, score: scoreWord(cleaned), reason: 'ok', slang: false };
  }
  if (funMode && isSlangWord(cleaned)) {
    return { valid: true, word: cleaned, score: scoreWord(cleaned) + SLANG_BONUS, reason: 'slang', slang: true };
  }
  return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false };
}

export function flipCoin() {
  return randomInt(2) === 0 ? 'p1' : 'p2';
}

export function activePlayerId(firstPlayerId, turnIndex) {
  const second = firstPlayerId === 'p1' ? 'p2' : 'p1';
  return turnIndex % 2 === 0 ? firstPlayerId : second;
}

export class RoomManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.tokens = new Map();
    this.defaultTurnSeconds = options.turnSeconds || DEFAULT_TURN_SECONDS;
    this.testSecret = options.testSecret || '';
    this.now = options.now || (() => Date.now());
    this.onEmit = options.onEmit || (() => {});
    this.onReaction = options.onReaction || (() => {});
    this.timers = new Map();
  }

  _clearTimers(code) {
    const timers = this.timers.get(code);
    if (!timers) return;
    for (const id of Object.values(timers)) {
      if (id) clearTimeout(id);
    }
    this.timers.delete(code);
  }

  _setTimer(code, name, fn, ms) {
    let timers = this.timers.get(code);
    if (!timers) {
      timers = {};
      this.timers.set(code, timers);
    }
    if (timers[name]) clearTimeout(timers[name]);
    timers[name] = setTimeout(fn, ms);
  }

  _emit(room) {
    this.onEmit(room);
  }

  createRoom({ name, token, testSecret, turnSeconds, socketId, funMode } = {}) {
    if (token) this.leaveByToken(token);
    const existing = new Set(this.rooms.keys());
    const code = generateCode(existing);
    const playerToken = randomUUID();
    const turnSecs = this._resolveTurnSeconds(testSecret, turnSeconds);
    const player = this._makePlayer('p1', name, playerToken, socketId);
    const room = {
      code,
      status: 'lobby',
      turnSeconds: turnSecs,
      firstPlayerId: null,
      turnIndex: 0,
      current: null,
      lastResult: null,
      rematch: { p1: false, p2: false },
      funMode: !!funMode,
      players: { p1: player, p2: null },
      createdAt: this.now(),
    };
    this.rooms.set(code, room);
    this.tokens.set(playerToken, { code, playerId: 'p1' });
    this._scheduleCleanup(room);
    this._emit(room);
    return { room, player };
  }

  joinRoom({ code, name, token, socketId } = {}) {
    const room = this.rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return { error: 'No room with that code.' };
    if (token) {
      const existing = this.tokens.get(token);
      if (existing && existing.code === room.code) {
        return this.resume({ token, socketId, name });
      }
      this.leaveByToken(token);
    }
    if (room.players.p2) return { error: 'That room is already full.' };
    if (room.status !== 'lobby') return { error: 'That match has already started.' };
    const playerToken = randomUUID();
    const player = this._makePlayer('p2', name, playerToken, socketId);
    room.players.p2 = player;
    this.tokens.set(playerToken, { code: room.code, playerId: 'p2' });
    this._startCoinFlip(room);
    return { room, player };
  }

  resume({ token, socketId, name } = {}) {
    const ref = this.tokens.get(token);
    if (!ref) return { error: 'session-expired' };
    const room = this.rooms.get(ref.code);
    if (!room) {
      this.tokens.delete(token);
      return { error: 'session-expired' };
    }
    const player = room.players[ref.playerId];
    if (!player || player.token !== token) return { error: 'session-expired' };
    player.socketId = socketId;
    player.connected = true;
    if (name) player.name = sanitiseName(name);
    if (room.status === 'paused') this._resumeTurn(room);
    this._emit(room);
    return { room, player, resumed: true };
  }

  disconnect(socketId) {
    const found = this._findBySocket(socketId);
    if (!found) return;
    const { room, player } = found;
    player.connected = false;
    player.socketId = null;
    if (room.status === 'playing' && room.current && !room.current.paused) {
      this._pauseTurn(room);
    }
    this._emit(room);
    this._scheduleCleanup(room);
  }

  leaveByToken(token) {
    const ref = this.tokens.get(token);
    if (!ref) return;
    const room = this.rooms.get(ref.code);
    this.tokens.delete(token);
    if (!room) return;
    const player = room.players[ref.playerId];
    if (player && player.token === token) {
      player.connected = false;
      player.socketId = null;
    }
    if (room.status === 'lobby') {
      this._destroyRoom(room.code);
      return;
    }
    this._emit(room);
    this._scheduleCleanup(room);
  }

  submitWord(socketId, word) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.status !== 'playing' || !room.current) return { error: 'It is not time to play a word.' };
    if (room.current.paused) return { error: 'Waiting for your opponent to return.' };
    if (room.current.playerId !== player.id) return { error: 'It is not your turn.' };
    if (room.current.submitted) return { error: 'You have already played this turn.' };
    const judged = judgeWord(word, room.current.letters, { funMode: !!room.funMode });
    this._finishTurn(room, judged);
    return { ok: true };
  }

  checkWord(socketId, word, token) {
    const found = this._findPlayer(socketId, token);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    // Rebind a fresh socket (refresh / reconnect) so later events keep working
    // even if the client has not finished its resume handshake yet.
    if (socketId && player.socketId !== socketId) {
      player.socketId = socketId;
      player.connected = true;
    }
    if (room.status === 'paused' && room.current?.paused) {
      this._resumeTurn(room);
      this._emit(room);
    }
    if (room.status !== 'playing' || !room.current || room.current.paused || room.current.submitted) {
      return { error: 'It is not time to play a word.' };
    }
    if (room.current.playerId !== player.id) return { error: 'It is not your turn.' };
    // A word check is a cheap in-memory lookup. Always answer it so a rapid
    // tap or a stale rate-limit stamp cannot hide the "✓ word!" hint.
    player.lastCheckAt = this.now();
    const cleaned = sanitiseWord(word);
    if (cleaned.length < MIN_WORD_LEN || !canForm(cleaned, room.current.letters)) {
      return { ok: true, word: cleaned, valid: false, slang: false };
    }
    if (isValidWord(cleaned)) {
      return { ok: true, word: cleaned, valid: true, slang: false };
    }
    const slangOnly = !!room.funMode && isSlangWord(cleaned);
    return { ok: true, word: cleaned, valid: slangOnly, slang: slangOnly };
  }

  react(socketId, emoji) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    if (!EMOJIS.includes(emoji)) return { error: 'Unknown reaction.' };
    const { room, player } = found;
    const now = this.now();
    if (now - (player.lastReactionAt || 0) < REACTION_MIN_INTERVAL_MS) {
      return { error: 'Easy, tiger.' };
    }
    player.lastReactionAt = now;
    this.onReaction(room, { emoji, fromId: player.id, fromName: player.name });
    return { ok: true };
  }

  rematch(socketId) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.status !== 'ended') return { error: 'The match is not over yet.' };
    room.rematch[player.id] = true;
    if (room.rematch.p1 && room.rematch.p2) {
      this._resetForRematch(room);
    } else {
      this._emit(room);
    }
    return { ok: true };
  }

  serialize(room, forPlayerId) {
    const you = room.players[forPlayerId];
    const opponent = room.players[forPlayerId === 'p1' ? 'p2' : 'p1'];
    const current = room.current
      ? {
          playerId: room.current.playerId,
          letters: room.current.letters,
          values: room.current.letters.map((ch) => LETTER_VALUES[ch]),
          turnNumber: room.current.turnNumber,
          endsAt: room.current.endsAt,
          remainingMs: room.current.paused
            ? room.current.remainingMs
            : Math.max(0, room.current.endsAt - this.now()),
          paused: !!room.current.paused,
          submitted: !!room.current.submitted,
          yours: room.current.playerId === forPlayerId,
        }
      : null;
    return {
      version: VERSION,
      code: room.code,
      status: room.status,
      turnSeconds: room.turnSeconds,
      firstPlayerId: room.firstPlayerId,
      turnIndex: room.turnIndex,
      you: you ? this._publicPlayer(you, true) : null,
      opponent: opponent ? this._publicPlayer(opponent, false) : null,
      current,
      lastResult: room.lastResult,
      funMode: !!room.funMode,
      rematch: {
        you: !!(you && room.rematch[you.id]),
        opponent: !!(opponent && room.rematch[opponent.id]),
      },
    };
  }

  _resolveTurnSeconds(testSecret, turnSeconds) {
    if (this.testSecret && testSecret && testSecret === this.testSecret) {
      const n = Number(turnSeconds);
      if (Number.isFinite(n)) return Math.min(60, Math.max(2, Math.round(n)));
    }
    return this.defaultTurnSeconds;
  }

  _makePlayer(id, name, token, socketId) {
    return {
      id,
      name: sanitiseName(name),
      token,
      socketId,
      connected: true,
      score: 0,
      history: [],
      lastReactionAt: 0,
      lastCheckAt: 0,
    };
  }

  _publicPlayer(player, includeToken) {
    return {
      id: player.id,
      name: player.name,
      connected: player.connected,
      score: player.score,
      history: player.history,
      token: includeToken ? player.token : undefined,
    };
  }

  _findBySocket(socketId) {
    if (!socketId) return null;
    for (const room of this.rooms.values()) {
      for (const player of [room.players.p1, room.players.p2]) {
        if (player && player.socketId === socketId) return { room, player };
      }
    }
    return null;
  }

  _findPlayer(socketId, token) {
    if (token) {
      const ref = this.tokens.get(token);
      if (ref) {
        const room = this.rooms.get(ref.code);
        const player = room?.players[ref.playerId];
        if (player && player.token === token) return { room, player };
      }
    }
    return this._findBySocket(socketId);
  }

  _startCoinFlip(room) {
    room.status = 'coin';
    room.firstPlayerId = flipCoin();
    room.turnIndex = 0;
    room.lastResult = null;
    room.rematch = { p1: false, p2: false };
    this._emit(room);
    this._setTimer(room.code, 'coin', () => {
      if (!this.rooms.has(room.code) || room.status !== 'coin') return;
      this._startTurn(room);
    }, 2400);
  }

  _startTurn(room) {
    if (!room.players.p1 || !room.players.p2) return;
    if (room.turnIndex >= TOTAL_TURNS) {
      this._endGame(room);
      return;
    }
    const playerId = activePlayerId(room.firstPlayerId, room.turnIndex);
    const letters = generateScramble();
    const now = this.now();
    room.status = 'playing';
    room.current = {
      playerId,
      letters,
      turnNumber: room.turnIndex + 1,
      startedAt: now,
      endsAt: now + room.turnSeconds * 1000,
      remainingMs: room.turnSeconds * 1000,
      paused: false,
      submitted: false,
    };
    if (!room.players.p1.connected || !room.players.p2.connected) {
      this._pauseTurn(room);
    }
    this._emit(room);
    this._armTurnTimer(room);
  }

  _armTurnTimer(room) {
    if (!room.current || room.current.paused) return;
    const ms = Math.max(0, room.current.endsAt - this.now());
    this._setTimer(room.code, 'turn', () => {
      if (!this.rooms.has(room.code)) return;
      if (room.status !== 'playing' || !room.current || room.current.submitted) return;
      this._finishTurn(room, {
        valid: false,
        word: '',
        score: 0,
        reason: 'timeout',
      });
    }, ms + 20);
  }

  _pauseTurn(room) {
    if (!room.current || room.current.paused || room.current.submitted) return;
    room.current.remainingMs = Math.max(0, room.current.endsAt - this.now());
    room.current.paused = true;
    room.status = 'paused';
    const timers = this.timers.get(room.code);
    if (timers && timers.turn) {
      clearTimeout(timers.turn);
      timers.turn = null;
    }
  }

  _resumeTurn(room) {
    if (!room.current || !room.current.paused) {
      if (room.status === 'paused' && room.players.p1.connected && room.players.p2?.connected) {
        room.status = 'playing';
      }
      return;
    }
    if (!room.players.p1.connected || !room.players.p2?.connected) return;
    const now = this.now();
    room.current.paused = false;
    room.current.startedAt = now;
    room.current.endsAt = now + room.current.remainingMs;
    room.status = 'playing';
    this._armTurnTimer(room);
  }

  _finishTurn(room, judged) {
    if (!room.current || room.current.submitted) return;
    room.current.submitted = true;
    const timers = this.timers.get(room.code);
    if (timers && timers.turn) {
      clearTimeout(timers.turn);
      timers.turn = null;
    }
    const player = room.players[room.current.playerId];
    const entry = {
      word: judged.word,
      score: judged.score,
      valid: judged.valid,
      reason: judged.reason,
      slang: !!judged.slang,
      turnNumber: room.current.turnNumber,
    };
    player.history.push(entry);
    player.score += judged.score;
    room.lastResult = {
      playerId: player.id,
      playerName: player.name,
      ...entry,
      scores: {
        p1: room.players.p1.score,
        p2: room.players.p2.score,
      },
    };
    room.status = 'intermission';
    room.turnIndex += 1;
    this._emit(room);
    this._setTimer(room.code, 'intermission', () => {
      if (!this.rooms.has(room.code) || room.status !== 'intermission') return;
      if (room.turnIndex >= TOTAL_TURNS) this._endGame(room);
      else this._startTurn(room);
    }, INTERMISSION_MS);
  }

  _endGame(room) {
    room.status = 'ended';
    room.current = null;
    const s1 = room.players.p1.score;
    const s2 = room.players.p2.score;
    room.winnerId = s1 === s2 ? null : (s1 > s2 ? 'p1' : 'p2');
    this._emit(room);
  }

  _resetForRematch(room) {
    room.players.p1.score = 0;
    room.players.p1.history = [];
    room.players.p2.score = 0;
    room.players.p2.history = [];
    room.turnIndex = 0;
    room.current = null;
    room.lastResult = null;
    room.winnerId = null;
    room.rematch = { p1: false, p2: false };
    this._startCoinFlip(room);
  }

  _scheduleCleanup(room) {
    const bothGone = !room.players.p1?.connected && !room.players.p2?.connected;
    if (!bothGone && !(room.status === 'lobby' && !room.players.p1?.connected)) return;
    this._setTimer(room.code, 'cleanup', () => {
      const current = this.rooms.get(room.code);
      if (!current) return;
      const idle = !current.players.p1?.connected && !current.players.p2?.connected;
      const emptyLobby = current.status === 'lobby' && !current.players.p1?.connected;
      if (idle || emptyLobby) this._destroyRoom(room.code);
    }, ROOM_TTL_MS);
  }

  _destroyRoom(code) {
    const room = this.rooms.get(code);
    this._clearTimers(code);
    if (room) {
      for (const player of [room.players.p1, room.players.p2]) {
        if (player) this.tokens.delete(player.token);
      }
    }
    this.rooms.delete(code);
  }
}
