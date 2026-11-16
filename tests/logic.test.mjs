import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadDictionary, isValidWord } from '../server/dictionary.js';
import {
  generateCode,
  generateScramble,
  vowelCount,
  canForm,
  scoreWord,
  judgeWord,
  sanitiseName,
  sanitiseWord,
  flipCoin,
  activePlayerId,
  LETTER_VALUES,
  VOWELS,
  RoomManager,
  CHECK_WORD_MIN_INTERVAL_MS,
} from '../server/game.js';

describe('dictionary', () => {
  before(() => {
    const n = loadDictionary();
    assert.ok(n > 20000, 'dictionary should be large');
  });

  it('accepts British spellings and common short words', () => {
    for (const w of ['colour', 'realise', 'centre', 'defence', 'honour', 'cheque', 'to', 'at', 'qi', 'the', 'queue']) {
      assert.equal(isValidWord(w), true, w);
    }
  });

  it('rejects gibberish', () => {
    assert.equal(isValidWord('xqzqy'), false);
    assert.equal(isValidWord(''), false);
  });
});

describe('codes and scrambles', () => {
  it('makes 4-letter codes without ambiguous characters', () => {
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      const code = generateCode(seen);
      seen.add(code);
      assert.match(code, /^[A-Z]{4}$/);
      assert.equal(/[ILO]/.test(code), false);
    }
    assert.equal(seen.size, 80);
  });

  it('always returns 7 letters with at least 2 vowels', () => {
    for (let i = 0; i < 200; i++) {
      const letters = generateScramble();
      assert.equal(letters.length, 7);
      assert.ok(letters.every((ch) => /[A-Z]/.test(ch)));
      assert.ok(vowelCount(letters) >= 2, letters.join(''));
    }
  });
});

describe('scoring and forming words', () => {
  it('uses original rarer-letter values', () => {
    assert.equal(scoreWord('TO'), LETTER_VALUES.T + LETTER_VALUES.O);
    assert.equal(scoreWord('QUEUE'), 10 + 2 + 1 + 2 + 1);
    assert.equal(scoreWord('JAZZ'), 8 + 1 + 10 + 10);
    assert.ok(LETTER_VALUES.Q > LETTER_VALUES.A);
    assert.ok(LETTER_VALUES.Z > LETTER_VALUES.E);
  });

  it('only allows letters as often as they appear', () => {
    assert.equal(canForm('TO', ['T', 'O', 'A', 'E', 'R', 'S', 'N']), true);
    assert.equal(canForm('TOOT', ['T', 'O', 'A', 'E', 'R', 'S', 'N']), false);
    assert.equal(canForm('TOOT', ['T', 'O', 'O', 'T', 'R', 'S', 'N']), true);
  });

  it('judges words against the rack and dictionary', () => {
    loadDictionary();
    const rack = ['C', 'O', 'L', 'O', 'U', 'R', 'S'];
    const ok = judgeWord('colour', rack);
    assert.equal(ok.valid, true);
    assert.equal(ok.word, 'COLOUR');
    assert.equal(ok.score, scoreWord('COLOUR'));
    const bad = judgeWord('zzzzzz', rack);
    assert.equal(bad.valid, false);
    assert.equal(bad.score, 0);
    const short = judgeWord('A', ['A', 'T', 'E', 'R', 'S', 'N', 'O']);
    assert.equal(short.valid, false);
    assert.equal(short.reason, 'invalid');
  });
});

describe('helpers', () => {
  it('sanitises names and words', () => {
    assert.equal(sanitiseName('  Ada  Lovelace  extra'), 'Ada Lovelace ext');
    assert.equal(sanitiseName(''), 'Player');
    assert.equal(sanitiseWord('cOl-our!'), 'COLOUR');
  });

  it('alternates turns from the coin flip', () => {
    assert.equal(activePlayerId('p1', 0), 'p1');
    assert.equal(activePlayerId('p1', 1), 'p2');
    assert.equal(activePlayerId('p2', 0), 'p2');
    assert.equal(activePlayerId('p2', 1), 'p1');
    const flips = new Set(Array.from({ length: 40 }, () => flipCoin()));
    assert.ok(flips.has('p1') && flips.has('p2'));
  });

  it('treats Y as a consonant for the vowel guarantee', () => {
    assert.ok(VOWELS.includes('A'));
    assert.equal(VOWELS.includes('Y'), false);
  });
});

describe('checkWord', () => {
  let now;
  let manager;
  let room;

  function playState() {
    now = 10_000;
    manager = new RoomManager({ now: () => now, turnSeconds: 60, onEmit() {} });
    const created = manager.createRoom({ name: 'Ada', socketId: 's1' });
    room = created.room;
    manager.joinRoom({ code: room.code, name: 'Bea', socketId: 's2' });
    manager._clearTimers(room.code);
    room.status = 'playing';
    room.firstPlayerId = 'p1';
    room.turnIndex = 0;
    room.current = {
      playerId: 'p1',
      letters: ['C', 'O', 'L', 'O', 'U', 'R', 'S'],
      turnNumber: 1,
      startedAt: now,
      endsAt: now + 60_000,
      remainingMs: 60_000,
      paused: false,
      submitted: false,
    };
  }

  before(() => {
    loadDictionary();
  });

  it('returns true for a dictionary word the active player can form', () => {
    playState();
    const result = manager.checkWord('s1', 'colour');
    assert.equal(result.ok, true);
    assert.equal(result.word, 'COLOUR');
    assert.equal(result.valid, true);
  });

  it('returns false for a non-word, a one-letter string, or letters not on the rack', () => {
    playState();
    assert.equal(manager.checkWord('s1', 'xqzqy').valid, false);
    now += CHECK_WORD_MIN_INTERVAL_MS;
    assert.equal(manager.checkWord('s1', 'C').valid, false);
    now += CHECK_WORD_MIN_INTERVAL_MS;
    assert.equal(manager.checkWord('s1', 'ZEBRA').valid, false);
  });

  it('rejects anyone who is not the active player in a live turn', () => {
    playState();
    const opp = manager.checkWord('s2', 'COLOUR');
    assert.equal(opp.error, 'It is not your turn.');
    const stranger = manager.checkWord('s9', 'COLOUR');
    assert.equal(stranger.error, 'You are not in a match.');
    room.current.paused = true;
    now += CHECK_WORD_MIN_INTERVAL_MS;
    const paused = manager.checkWord('s1', 'COLOUR');
    assert.equal(paused.error, 'It is not time to play a word.');
  });

  it('rate-limits repeated checks from the same player', () => {
    playState();
    const first = manager.checkWord('s1', 'COLOUR');
    assert.equal(first.valid, true);
    const rapid = manager.checkWord('s1', 'COLOURS');
    assert.equal(rapid.error, 'slow-down');
    now += CHECK_WORD_MIN_INTERVAL_MS;
    const later = manager.checkWord('s1', 'COLOURS');
    assert.equal(later.valid, true);
  });
});
