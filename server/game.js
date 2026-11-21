import { randomInt, randomUUID } from 'node:crypto';
import { isValidWord, isSlangWord } from './dictionary.js';
import {
  generatePuzzle,
  loadCommon,
  puzzleHasWord,
  resolveRaceSize,
  canFormWord,
} from './crossword.js';
import {
  generateStory,
  resolveStoryLength,
  sanitiseAnswers,
  answersComplete,
  autoFillAnswers,
  renderLine,
  renderStoryText,
  voteLineIndexes,
  answersForLine,
  preambleLines,
  VERSION_KEYS,
  VERSION_LABELS,
  STORY_FILL_SECONDS,
  VOTE_REVEAL_MS,
} from './story.js';

export const VERSION = 'v0.6';
let commonLoaded = false;
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
export const REROLLS_EACH = 3;
export const DW_CHANCE = 0.28;
export { STORY_FILL_SECONDS, VOTE_REVEAL_MS };

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

export function assignBonus(letterCount = LETTER_COUNT, rng = Math.random) {
  const type = rng() < DW_CHANCE ? 'DW' : 'DL';
  const index = Math.min(letterCount - 1, Math.max(0, Math.floor(rng() * letterCount)));
  return { type, index };
}

export function resolveUsedIndexes(word, letters, usedIndexes) {
  const cleaned = sanitiseWord(word);
  if (Array.isArray(usedIndexes) && usedIndexes.length === cleaned.length) {
    const nums = usedIndexes.map((n) => Number(n));
    if (new Set(nums).size !== nums.length) return null;
    const picked = [];
    for (const i of nums) {
      if (!Number.isInteger(i) || i < 0 || i >= letters.length) return null;
      picked.push(letters[i]);
    }
    if (picked.join('') === cleaned) return nums;
    return null;
  }
  return null;
}

export function mustHaveUsedBonus(word, letters, bonus) {
  if (!bonus || bonus.index == null) return false;
  const letter = letters[bonus.index];
  if (!letter) return false;
  const cleaned = sanitiseWord(word);
  const need = [...cleaned].filter((ch) => ch === letter).length;
  const have = letters.filter((ch) => ch === letter).length;
  return need > 0 && need === have;
}

export function bonusApplies(word, letters, bonus, usedIndexes) {
  if (!bonus) return false;
  const resolved = resolveUsedIndexes(word, letters, usedIndexes);
  if (resolved) return resolved.includes(bonus.index);
  return mustHaveUsedBonus(word, letters, bonus);
}

export function scoreWordWithBonus(word, letters, bonus, usedIndexes, { funMode = false } = {}) {
  const cleaned = sanitiseWord(word);
  const applied = bonusApplies(cleaned, letters, bonus, usedIndexes);
  const letterParts = [];
  let subtotal = 0;
  const resolved = resolveUsedIndexes(cleaned, letters, usedIndexes);
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const base = LETTER_VALUES[ch] || 0;
    const tileIndex = resolved ? resolved[i] : null;
    const isDl = !!(applied && bonus?.type === 'DL' && (
      (tileIndex != null && tileIndex === bonus.index)
      || (tileIndex == null && ch === letters[bonus.index] && !letterParts.some((p) => p.doubled))
    ));
    const value = isDl ? base * 2 : base;
    letterParts.push({ letter: ch, value: base, scored: value, doubled: isDl });
    subtotal += value;
  }
  const wordMultiplier = applied && bonus?.type === 'DW' ? 2 : 1;
  let total = subtotal * wordMultiplier;
  let slang = false;
  if (funMode && isSlangWord(cleaned) && !isValidWord(cleaned)) {
    total += SLANG_BONUS;
    slang = true;
  }
  return {
    word: cleaned,
    score: total,
    applied,
    slang,
    breakdown: {
      letters: letterParts,
      subtotal,
      wordMultiplier,
      slangBonus: slang ? SLANG_BONUS : 0,
      bonusType: applied ? bonus.type : null,
      bonusLetter: applied ? letters[bonus.index] : null,
      total,
    },
  };
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

export function judgeWord(word, letters, { funMode = false, bonus = null, usedIndexes = null } = {}) {
  const cleaned = sanitiseWord(word);
  if (cleaned.length < MIN_WORD_LEN) {
    return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false, breakdown: null, bonusApplied: false };
  }
  if (!canForm(cleaned, letters)) {
    return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false, breakdown: null, bonusApplied: false };
  }
  if (isValidWord(cleaned) || (funMode && isSlangWord(cleaned))) {
    const scored = scoreWordWithBonus(cleaned, letters, bonus, usedIndexes, { funMode });
    const slangOnly = !isValidWord(cleaned) && scored.slang;
    return {
      valid: true,
      word: cleaned,
      score: scored.score,
      reason: slangOnly ? 'slang' : 'ok',
      slang: slangOnly,
      breakdown: scored.breakdown,
      bonusApplied: scored.applied,
    };
  }
  return { valid: false, word: cleaned, score: 0, reason: 'invalid', slang: false, breakdown: null, bonusApplied: false };
}

export function flipCoin() {
  return randomInt(2) === 0 ? 'p1' : 'p2';
}

export function activePlayerId(firstPlayerId, turnIndex) {
  const second = firstPlayerId === 'p1' ? 'p2' : 'p1';
  return turnIndex % 2 === 0 ? firstPlayerId : second;
}

export function resolveMode(mode) {
  const value = String(mode || '').toLowerCase();
  if (value === 'story') return 'story';
  if (value === 'race' || value === 'crossword' || value === 'crossword-race') return 'race';
  return 'classic';
}

export class RoomManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.tokens = new Map();
    this.defaultTurnSeconds = options.turnSeconds || DEFAULT_TURN_SECONDS;
    this.defaultFillSeconds = options.fillSeconds || STORY_FILL_SECONDS;
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

  createRoom({ name, token, testSecret, turnSeconds, fillSeconds, socketId, funMode, mode, storyLength, raceSize, puzzleSeed } = {}) {
    if (token) this.leaveByToken(token);
    const existing = new Set(this.rooms.keys());
    const code = generateCode(existing);
    const playerToken = randomUUID();
    const turnSecs = this._resolveTurnSeconds(testSecret, turnSeconds);
    const player = this._makePlayer('p1', name, playerToken, socketId);
    const gameMode = resolveMode(mode);
    const room = {
      code,
      status: 'lobby',
      mode: gameMode,
      matchId: randomUUID(),
      turnSeconds: turnSecs,
      fillSeconds: this._resolveFillSeconds(testSecret, fillSeconds),
      storyLength: gameMode === 'story' ? resolveStoryLength(storyLength) : 0,
      raceSize: gameMode === 'race' ? resolveRaceSize(raceSize) : null,
      puzzleSeed: gameMode === 'race' ? this._resolvePuzzleSeed(testSecret, puzzleSeed) : null,
      firstPlayerId: null,
      turnIndex: 0,
      current: null,
      lastResult: null,
      lastReroll: null,
      rematch: { p1: false, p2: false },
      funMode: gameMode === 'classic' && !!funMode,
      story: null,
      race: null,
      winnerId: null,
      resumeStatus: null,
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
    if (room.mode === 'story') this._startStoryFill(room);
    else if (room.mode === 'race') this._startRace(room);
    else this._startCoinFlip(room);
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
    if (room.status === 'paused') this._resumeClock(room);
    this._emit(room);
    return { room, player, resumed: true };
  }

  disconnect(socketId) {
    const found = this._findBySocket(socketId);
    if (!found) return;
    const { room, player } = found;
    player.connected = false;
    player.socketId = null;
    this._pauseIfNeeded(room);
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
    this._pauseIfNeeded(room);
    this._emit(room);
    this._scheduleCleanup(room);
  }

  submitWord(socketId, word, usedIndexes) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.mode === 'story' || room.mode === 'race') return { error: 'It is not time to play a word.' };
    if (room.status !== 'playing' || !room.current) return { error: 'It is not time to play a word.' };
    if (room.current.paused) return { error: 'Waiting for your opponent to return.' };
    if (room.current.playerId !== player.id) return { error: 'It is not your turn.' };
    if (room.current.submitted) return { error: 'You have already played this turn.' };
    const judged = judgeWord(word, room.current.letters, {
      funMode: !!room.funMode,
      bonus: room.current.bonus,
      usedIndexes,
    });
    this._finishTurn(room, judged);
    return { ok: true };
  }

  submitRaceWord(socketId, word) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.mode !== 'race' || !room.race) return { error: 'This is not a Crossword Race.' };
    if (room.status === 'paused' || room.race.paused) return { error: 'Waiting for your opponent to return.' };
    if (room.status === 'ended') return { error: 'The race is already over.' };
    if (room.status !== 'racing') return { error: 'It is not time to play a word.' };
    const cleaned = sanitiseWord(word);
    if (cleaned.length < 3) return { ok: true, result: 'miss', word: cleaned };
    const already = room.race.found[player.id].includes(cleaned);
    if (already) return { ok: true, result: 'already', word: cleaned };
    const onGrid = puzzleHasWord(room.race.puzzle, cleaned);
    const formable = canFormWord(cleaned, room.race.puzzle.letters);
    if (!onGrid || !formable) return { ok: true, result: 'miss', word: cleaned };
    room.race.found[player.id].push(cleaned);
    player.score = room.race.found[player.id].length;
    if (player.score >= room.race.puzzle.words.length) {
      this._endRace(room, player.id);
    } else {
      this._emit(room);
    }
    return { ok: true, result: 'found', word: cleaned };
  }

  submitStory(socketId, answers) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.mode !== 'story' || !room.story) return { error: 'This is not a Story Duel.' };
    if (room.status === 'paused') return { error: 'Waiting for your opponent to return.' };
    if (room.status !== 'filling') return { error: 'It is not time to fill the story.' };
    if (room.story.submitted[player.id]) return { error: 'You have already submitted.' };
    const cleaned = sanitiseAnswers(answers, room.story.blanks.length);
    if (!answersComplete(cleaned)) return { error: 'Please fill in every blank.' };
    room.story.answers[player.id] = cleaned;
    room.story.submitted[player.id] = true;
    this._maybeStartReveal(room);
    this._emit(room);
    return { ok: true };
  }

  voteStory(socketId, key) {
    const found = this._findBySocket(socketId);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (room.mode !== 'story' || !room.story) return { error: 'This is not a Story Duel.' };
    if (room.status !== 'revealing') return { error: 'It is not time to vote.' };
    if (room.story.voteReveal) return { error: 'Voting for this line is over.' };
    if (!VERSION_KEYS.includes(key)) return { error: 'Pick a version to vote for.' };
    if (room.story.votes[player.id]) return { error: 'You have already voted.' };
    room.story.votes[player.id] = key;
    if (room.story.votes.p1 && room.story.votes.p2) this._applyVotes(room);
    else this._emit(room);
    return { ok: true };
  }

  checkWord(socketId, word, token) {
    const found = this._findPlayer(socketId, token);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
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

  reroll(socketId, token) {
    const found = this._findPlayer(socketId, token);
    if (!found) return { error: 'You are not in a match.' };
    const { room, player } = found;
    if (socketId && player.socketId !== socketId) {
      player.socketId = socketId;
      player.connected = true;
    }
    if (room.mode !== 'classic') return { error: 'Rerolls are only for Word Duel.' };
    if (room.status === 'paused' && room.current?.paused) {
      this._resumeTurn(room);
      this._emit(room);
    }
    if (room.current?.paused || room.status === 'paused') {
      return { error: 'Waiting for your opponent to return.' };
    }
    if (room.status !== 'playing' || !room.current) return { error: 'It is not time to play a word.' };
    if (room.current.playerId !== player.id) return { error: 'It is not your turn.' };
    if (room.current.submitted) return { error: 'You have already played this turn.' };
    if ((player.rerollsLeft || 0) <= 0) return { error: 'No rerolls left.' };
    player.rerollsLeft -= 1;
    const letters = generateScramble();
    room.current.letters = letters;
    room.current.bonus = assignBonus(letters.length);
    room.current.scrambleId = (room.current.scrambleId || 0) + 1;
    room.lastReroll = {
      playerId: player.id,
      turnNumber: room.current.turnNumber,
      at: this.now(),
    };
    this._emit(room);
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
          bonus: room.current.bonus || null,
          turnNumber: room.current.turnNumber,
          endsAt: room.current.endsAt,
          remainingMs: room.current.paused
            ? room.current.remainingMs
            : Math.max(0, room.current.endsAt - this.now()),
          paused: !!room.current.paused,
          submitted: !!room.current.submitted,
          yours: room.current.playerId === forPlayerId,
          scrambleId: room.current.scrambleId || 0,
        }
      : null;
    return {
      version: VERSION,
      code: room.code,
      status: room.status,
      mode: room.mode || 'classic',
      matchId: room.matchId,
      turnSeconds: room.turnSeconds,
      fillSeconds: room.fillSeconds,
      storyLength: room.storyLength,
      raceSize: room.raceSize,
      firstPlayerId: room.firstPlayerId,
      turnIndex: room.turnIndex,
      you: you ? this._publicPlayer(you, true) : null,
      opponent: opponent ? this._publicPlayer(opponent, false) : null,
      current,
      lastResult: room.lastResult,
      lastReroll: this._serializeLastReroll(room, forPlayerId),
      funMode: !!room.funMode,
      story: this._serializeStory(room, forPlayerId),
      race: this._serializeRace(room, forPlayerId),
      winnerId: room.status === 'ended' ? (room.winnerId || null) : undefined,
      rematch: {
        you: !!(you && room.rematch[you.id]),
        opponent: !!(opponent && room.rematch[opponent.id]),
      },
    };
  }

  _serializeLastReroll(room, forPlayerId) {
    const event = room.lastReroll;
    if (!event) return null;
    const who = room.players[event.playerId];
    return {
      playerId: event.playerId,
      yours: event.playerId === forPlayerId,
      name: who?.name || 'Player',
      turnNumber: event.turnNumber || 0,
    };
  }

  _serializeStory(room, forPlayerId) {
    const story = room.story;
    if (!story || room.mode !== 'story') return null;
    const you = forPlayerId;
    const opp = forPlayerId === 'p1' ? 'p2' : 'p1';
    const lines = story.lines.map((line, index) => ({
      index,
      text: renderLine(line.template, line.blanks.map(() => '')),
      numbered: undefined,
      templateNumbers: line.template,
      blankCount: line.blanks.length,
      prompts: line.blanks.map((b) => b.prompt),
    }));
    // numbered text with [1] [2] for the whole story, counted across all blanks
    let n = 0;
    const numberedStory = story.lines.map((line) => line.template.replace(/\{[a-z]+\}/g, () => `[${++n}]`)).join(' ');
    const base = {
      length: room.storyLength,
      numberedStory,
      lines: lines.map((line) => ({
        index: line.index,
        blankCount: line.blankCount,
        prompts: line.prompts,
        text: story.lines[line.index].template.replace(/\{[a-z]+\}/g, '____'),
      })),
      blanks: story.blanks.map((b) => ({
        id: b.id,
        prompt: b.prompt,
        type: b.type,
        lineIndex: b.lineIndex,
      })),
      youSubmitted: !!story.submitted[you],
      opponentSubmitted: !!story.submitted[opp],
      yourAnswers: (story.answers[you] || story.blanks.map(() => '')).slice(),
    };

    const fillLike = room.status === 'filling' || (room.status === 'paused' && room.resumeStatus === 'filling');
    if (fillLike) {
      return {
        ...base,
        phase: 'fill',
        endsAt: story.fillEndsAt,
        remainingMs: story.paused
          ? story.remainingMs
          : Math.max(0, story.fillEndsAt - this.now()),
        paused: !!story.paused,
      };
    }

    const ended = room.status === 'ended';
    const revealing = room.status === 'revealing' || (room.status === 'paused' && room.resumeStatus === 'revealing') || ended;
    if (!revealing) return { ...base, phase: 'lobby' };

    const voteLines = story.voteLines;
    const lineIndex = Math.min(story.revealIndex, Math.max(0, voteLines.length - 1));
    const rawLineIndex = voteLines[lineIndex];
    const order = story.versionOrder || ['p1', 'p2'];
    const versions = order.map((pid, i) => {
      const key = VERSION_KEYS[i];
      const answers = answersForLine(story, story.answers[pid], rawLineIndex);
      const ver = {
        key,
        label: VERSION_LABELS[key],
        text: renderLine(story.lines[rawLineIndex].template, answers),
      };
      if (story.voteReveal || ended) {
        ver.playerId = pid;
        ver.yours = pid === you;
        ver.name = room.players[pid]?.name;
      }
      return ver;
    });

    const payload = {
      ...base,
      phase: ended ? 'ended' : 'reveal',
      subphase: story.voteReveal || ended ? 'authors' : 'vote',
      lineIndex,
      lineCount: voteLines.length,
      preamble: preambleLines(story, rawLineIndex),
      currentLine: {
        template: story.lines[rawLineIndex].template.replace(/\{[a-z]+\}/g, '____'),
        versions,
      },
      youVoted: !!story.votes[you],
      opponentVoted: !!story.votes[opp],
      yourVote: story.votes[you] || null,
      scores: {
        you: room.players[you]?.score || 0,
        opponent: room.players[opp]?.score || 0,
      },
    };

    if (story.voteReveal || ended) {
      const tally = { peach: 0, blossom: 0 };
      for (const pid of ['p1', 'p2']) {
        if (story.votes[pid]) tally[story.votes[pid]] += 1;
      }
      payload.tally = tally;
    }

    if (ended) {
      const youText = renderStoryText(story.lines, story.answers[you], story.blanks);
      const oppText = renderStoryText(story.lines, story.answers[opp], story.blanks);
      payload.fullStories = {
        you: youText,
        opponent: oppText,
        merged: this._mergedStory(room, you, opp),
      };
    }
    return payload;
  }

  _mergedStory(room, youId, oppId) {
    const story = room.story;
    const parts = [];
    let cursor = 0;
    for (const line of story.lines) {
      if (!line.blanks.length) {
        parts.push({ text: line.template, winner: null });
        continue;
      }
      const youSlice = (story.answers[youId] || []).slice(cursor, cursor + line.blanks.length);
      const oppSlice = (story.answers[oppId] || []).slice(cursor, cursor + line.blanks.length);
      cursor += line.blanks.length;
      const lineKey = story.lineWinners?.[line.id] || story.lineWinners?.[String(story.lines.indexOf(line))];
      // lineWinners keyed by raw line index
      const rawIndex = story.lines.indexOf(line);
      const winnerId = story.lineWinners?.[rawIndex] || null;
      parts.push({
        you: renderLine(line.template, youSlice),
        opponent: renderLine(line.template, oppSlice),
        winnerId,
        winner: winnerId === youId ? 'you' : winnerId === oppId ? 'opponent' : winnerId === 'draw' ? 'draw' : null,
      });
    }
    return parts;
  }

  _resolveTurnSeconds(testSecret, turnSeconds) {
    if (this.testSecret && testSecret && testSecret === this.testSecret) {
      const n = Number(turnSeconds);
      if (Number.isFinite(n)) return Math.min(60, Math.max(2, Math.round(n)));
    }
    return this.defaultTurnSeconds;
  }

  _resolveFillSeconds(testSecret, fillSeconds) {
    if (this.testSecret && testSecret && testSecret === this.testSecret) {
      const n = Number(fillSeconds);
      if (Number.isFinite(n)) return Math.min(180, Math.max(5, Math.round(n)));
    }
    return this.defaultFillSeconds;
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
      rerollsLeft: REROLLS_EACH,
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
      rerollsLeft: player.rerollsLeft ?? 0,
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
    room.lastReroll = null;
    room.rematch = { p1: false, p2: false };
    if (room.players.p1) room.players.p1.rerollsLeft = REROLLS_EACH;
    if (room.players.p2) room.players.p2.rerollsLeft = REROLLS_EACH;
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
    room.lastReroll = null;
    room.current = {
      playerId,
      letters,
      bonus: assignBonus(letters.length),
      scrambleId: 1,
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
        slang: false,
        breakdown: null,
        bonusApplied: false,
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

  _resumeClock(room) {
    if (room.resumeStatus === 'filling') this._resumeFill(room);
    else if (room.resumeStatus === 'racing' || room.mode === 'race') this._resumeRace(room);
    else this._resumeTurn(room);
  }

  _pauseIfNeeded(room) {
    if (room.status === 'playing' && room.current && !room.current.paused) this._pauseTurn(room);
    else if (room.status === 'filling' && room.story && !room.story.paused) this._pauseFill(room);
    else if (room.status === 'racing' && room.race && !room.race.paused) this._pauseRace(room);
  }

  _startStoryFill(room) {
    const generated = generateStory(room.storyLength);
    const now = this.now();
    const fillMs = room.fillSeconds * 1000;
    room.matchId = room.matchId || randomUUID();
    room.status = 'filling';
    room.resumeStatus = null;
    room.winnerId = null;
    room.lastResult = null;
    room.story = {
      lines: generated.lines,
      blanks: generated.blanks,
      answers: { p1: generated.blanks.map(() => ''), p2: generated.blanks.map(() => '') },
      submitted: { p1: false, p2: false },
      autoFilled: { p1: false, p2: false },
      fillStartedAt: now,
      fillEndsAt: now + fillMs,
      remainingMs: fillMs,
      paused: false,
      revealIndex: 0,
      voteLines: voteLineIndexes(generated),
      versionOrder: ['p1', 'p2'],
      votes: { p1: null, p2: null },
      voteReveal: false,
      lineWinners: {},
    };
    if (!room.players.p1.connected || !room.players.p2?.connected) {
      this._pauseFill(room);
    }
    this._emit(room);
    this._armFillTimer(room);
  }

  _armFillTimer(room) {
    if (!room.story || room.story.paused || room.status !== 'filling') return;
    const ms = Math.max(0, room.story.fillEndsAt - this.now());
    this._setTimer(room.code, 'fill', () => {
      if (!this.rooms.has(room.code)) return;
      if (room.status !== 'filling' || !room.story) return;
      this._timeoutFill(room);
    }, ms + 20);
  }

  _pauseFill(room) {
    if (!room.story || room.story.paused || room.status !== 'filling') return;
    room.story.remainingMs = Math.max(0, room.story.fillEndsAt - this.now());
    room.story.paused = true;
    room.resumeStatus = 'filling';
    room.status = 'paused';
    const timers = this.timers.get(room.code);
    if (timers && timers.fill) {
      clearTimeout(timers.fill);
      timers.fill = null;
    }
  }

  _resumeFill(room) {
    if (!room.story || !room.story.paused) {
      if (room.status === 'paused' && room.resumeStatus === 'filling' && room.players.p1.connected && room.players.p2?.connected) {
        room.status = 'filling';
        room.resumeStatus = null;
      }
      return;
    }
    if (!room.players.p1.connected || !room.players.p2?.connected) return;
    const now = this.now();
    room.story.paused = false;
    room.story.fillStartedAt = now;
    room.story.fillEndsAt = now + room.story.remainingMs;
    room.status = 'filling';
    room.resumeStatus = null;
    this._armFillTimer(room);
  }

  _timeoutFill(room) {
    for (const pid of ['p1', 'p2']) {
      if (!room.story.submitted[pid]) {
        room.story.answers[pid] = autoFillAnswers(room.story.blanks, room.story.answers[pid]);
        room.story.submitted[pid] = true;
        room.story.autoFilled[pid] = true;
      }
    }
    this._maybeStartReveal(room);
    this._emit(room);
  }

  _maybeStartReveal(room) {
    if (!room.story?.submitted.p1 || !room.story?.submitted.p2) return;
    const timers = this.timers.get(room.code);
    if (timers && timers.fill) {
      clearTimeout(timers.fill);
      timers.fill = null;
    }
    room.story.paused = false;
    this._beginRevealLine(room, 0);
  }

  _beginRevealLine(room, index) {
    const story = room.story;
    if (index >= story.voteLines.length) {
      this._endGame(room);
      return;
    }
    story.revealIndex = index;
    story.votes = { p1: null, p2: null };
    story.voteReveal = false;
    const order = ['p1', 'p2'];
    if (randomInt(2) === 1) order.reverse();
    story.versionOrder = order;
    room.status = 'revealing';
    room.resumeStatus = null;
    this._emit(room);
  }

  _applyVotes(room) {
    const story = room.story;
    const order = story.versionOrder;
    const keyToPlayer = {
      [VERSION_KEYS[0]]: order[0],
      [VERSION_KEYS[1]]: order[1],
    };
    const counts = { p1: 0, p2: 0 };
    for (const voter of ['p1', 'p2']) {
      const key = story.votes[voter];
      const author = keyToPlayer[key];
      if (author) {
        counts[author] += 1;
        room.players[author].score += 1;
      }
    }
    const rawLine = story.voteLines[story.revealIndex];
    if (counts.p1 === counts.p2) story.lineWinners[rawLine] = 'draw';
    else story.lineWinners[rawLine] = counts.p1 > counts.p2 ? 'p1' : 'p2';
    story.voteReveal = true;
    this._emit(room);
    this._setTimer(room.code, 'voteReveal', () => {
      if (!this.rooms.has(room.code) || room.status !== 'revealing') return;
      if (!room.story?.voteReveal) return;
      this._beginRevealLine(room, story.revealIndex + 1);
    }, VOTE_REVEAL_MS);
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
      bonusApplied: !!judged.bonusApplied,
      breakdown: judged.breakdown || null,
      bonus: room.current.bonus || null,
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
      if (!this.rooms.has(room.code)) return;
      if (room.turnIndex >= TOTAL_TURNS) this._endGame(room);
      else this._startTurn(room);
    }, INTERMISSION_MS);
  }

  _endGame(room) {
    room.status = 'ended';
    room.current = null;
    room.resumeStatus = null;
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
    room.lastReroll = null;
    room.winnerId = null;
    room.rematch = { p1: false, p2: false };
    room.players.p1.rerollsLeft = REROLLS_EACH;
    room.players.p2.rerollsLeft = REROLLS_EACH;
    room.matchId = randomUUID();
    room.story = null;
    room.race = null;
    if (room.mode === 'story') this._startStoryFill(room);
    else if (room.mode === 'race') {
      room.puzzleSeed = null;
      this._startRace(room);
    } else this._startCoinFlip(room);
  }

  _resolvePuzzleSeed(testSecret, puzzleSeed) {
    if (this.testSecret && testSecret && testSecret === this.testSecret) {
      const n = Number(puzzleSeed);
      if (Number.isFinite(n) && n !== 0) return (n >>> 0) || 1;
    }
    return null;
  }

  _raceElapsed(room) {
    if (!room.race) return 0;
    if (room.race.paused || room.status === 'ended') return room.race.elapsedMs || 0;
    return (room.race.elapsedMs || 0) + Math.max(0, this.now() - room.race.segmentStartedAt);
  }

  _startRace(room) {
    if (!commonLoaded) {
      loadCommon();
      commonLoaded = true;
    }
    const seed = room.puzzleSeed || (randomInt(0xffffffff) || 1);
    const puzzle = generatePuzzle(room.raceSize || 'small', seed);
    const now = this.now();
    room.matchId = room.matchId || randomUUID();
    room.status = 'racing';
    room.resumeStatus = null;
    room.winnerId = null;
    room.lastResult = null;
    room.current = null;
    room.rematch = { p1: false, p2: false };
    if (room.players.p1) {
      room.players.p1.score = 0;
      room.players.p1.history = [];
    }
    if (room.players.p2) {
      room.players.p2.score = 0;
      room.players.p2.history = [];
    }
    room.race = {
      size: puzzle.size,
      seed: puzzle.seed,
      puzzle,
      found: { p1: [], p2: [] },
      startedAt: now,
      segmentStartedAt: now,
      elapsedMs: 0,
      paused: false,
      endedAt: null,
    };
    if (!room.players.p1.connected || !room.players.p2?.connected) this._pauseRace(room);
    this._emit(room);
  }

  _pauseRace(room) {
    if (!room.race || room.race.paused || room.status !== 'racing') return;
    room.race.elapsedMs = this._raceElapsed(room);
    room.race.paused = true;
    room.resumeStatus = 'racing';
    room.status = 'paused';
  }

  _resumeRace(room) {
    if (!room.race) return;
    if (!room.race.paused) {
      if (room.status === 'paused' && room.resumeStatus === 'racing' && room.players.p1.connected && room.players.p2?.connected) {
        room.status = 'racing';
        room.resumeStatus = null;
      }
      return;
    }
    if (!room.players.p1.connected || !room.players.p2?.connected) return;
    room.race.paused = false;
    room.race.segmentStartedAt = this.now();
    room.status = 'racing';
    room.resumeStatus = null;
  }

  _endRace(room, winnerId) {
    if (!room.race) return;
    room.race.elapsedMs = this._raceElapsed(room);
    room.race.endedAt = this.now();
    room.race.paused = false;
    room.winnerId = winnerId;
    room.players.p1.score = room.race.found.p1.length;
    room.players.p2.score = room.race.found.p2.length;
    room.status = 'ended';
    room.resumeStatus = null;
    room.current = null;
    this._emit(room);
  }

  _serializeRace(room, forPlayerId) {
    const race = room.race;
    if (!race || room.mode !== 'race') return null;
    const you = forPlayerId;
    const opp = forPlayerId === 'p1' ? 'p2' : 'p1';
    const puzzle = race.puzzle;
    const yourFound = new Set(race.found[you] || []);
    const ended = room.status === 'ended';
    const slots = puzzle.words.map((place, index) => {
      const found = ended || yourFound.has(place.word);
      return {
        id: index,
        row: place.row,
        col: place.col,
        dir: place.dir,
        length: place.word.length,
        found,
        word: found ? place.word : null,
      };
    });
    return {
      size: race.size,
      letters: puzzle.letters.slice(),
      rows: puzzle.rows,
      cols: puzzle.cols,
      slots,
      youFound: (race.found[you] || []).slice(),
      youCount: (race.found[you] || []).length,
      opponentCount: (race.found[opp] || []).length,
      total: puzzle.words.length,
      elapsedMs: this._raceElapsed(room),
      paused: !!race.paused,
      ended,
    };
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
