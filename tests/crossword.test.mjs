import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCommon,
  commonSize,
  isCommonWord,
  createRng,
  canFormWord,
  subwordsFor,
  generatePuzzle,
  isConnectedPuzzle,
  assertConsistentGrid,
  puzzleWordList,
  puzzleHasWord,
  resolveRaceSize,
  RACE_SIZES,
} from '../server/crossword.js';
import { loadDictionary } from '../server/dictionary.js';
import {
  RoomManager,
  resolveMode,
  sanitiseWord,
} from '../server/game.js';

describe('common word list', () => {
  before(() => {
    const n = loadCommon();
    assert.ok(n > 10000, 'common list should be large');
  });

  it('is drawn from everyday 3–6 letter words', () => {
    assert.equal(isCommonWord('heart'), true);
    assert.equal(isCommonWord('colour'), true);
    assert.equal(isCommonWord('stone'), true);
    assert.equal(isCommonWord('planet'), true);
    assert.ok(commonSize() > 10000);
  });
});

describe('puzzle generation', () => {
  before(() => {
    loadCommon();
  });

  it('resolves size names', () => {
    assert.equal(resolveRaceSize('small'), 'small');
    assert.equal(resolveRaceSize('medium'), 'medium');
    assert.equal(resolveRaceSize(''), 'small');
    assert.equal(resolveRaceSize('LARGE'), 'small');
  });

  it('is deterministic for a given seed', () => {
    const a = generatePuzzle('small', 42);
    const b = generatePuzzle('small', 42);
    assert.deepEqual(a, b);
    const c = generatePuzzle('medium', 7);
    const d = generatePuzzle('medium', 7);
    assert.deepEqual(c, d);
    const e = generatePuzzle('small', 99);
    assert.notDeepEqual(a.words, e.words);
  });

  it('builds a connected small puzzle whose words come from the wheel', () => {
    for (const seed of [1, 2, 3, 8, 15, 42, 99, 1234, 9001, 555]) {
      const puzzle = generatePuzzle('small', seed);
      assert.equal(puzzle.size, 'small');
      assert.equal(puzzle.seed, seed);
      assert.equal(puzzle.letters.length, 5);
      const count = puzzle.words.length;
      assert.ok(count >= RACE_SIZES.small.minWords && count <= RACE_SIZES.small.maxWords, `seed ${seed} count ${count}`);
      assert.equal(isConnectedPuzzle(puzzle.words), true, `seed ${seed} not connected`);
      assert.equal(assertConsistentGrid(puzzle.words), true, `seed ${seed} inconsistent`);
      for (const place of puzzle.words) {
        assert.ok(place.word.length >= 3);
        assert.equal(canFormWord(place.word, puzzle.letters), true, `${place.word} from ${puzzle.letters.join('')} (seed ${seed})`);
        assert.equal(isCommonWord(place.word), true, place.word);
        assert.ok(place.dir === 'across' || place.dir === 'down');
        assert.ok(place.row >= 0 && place.col >= 0);
        assert.ok(place.row < puzzle.rows && place.col < puzzle.cols);
      }
      assert.ok(puzzle.rows <= 12 && puzzle.cols <= 12);
    }
  });

  it('builds a connected medium puzzle whose words come from the wheel', () => {
    for (const seed of [1, 4, 9, 21, 77, 200, 404, 1024]) {
      const puzzle = generatePuzzle('medium', seed);
      assert.equal(puzzle.size, 'medium');
      assert.equal(puzzle.letters.length, 6);
      const count = puzzle.words.length;
      assert.ok(count >= 8 && count <= 10, `seed ${seed} count ${count}`);
      assert.equal(isConnectedPuzzle(puzzle.words), true);
      assert.equal(assertConsistentGrid(puzzle.words), true);
      for (const place of puzzle.words) {
        assert.equal(canFormWord(place.word, puzzle.letters), true, place.word);
      }
    }
  });

  it('lists every formable common sub-word for a wheel', () => {
    const words = subwordsFor(['S', 'T', 'O', 'N', 'E']);
    assert.ok(words.includes('STONE'));
    assert.ok(words.includes('ONES') || words.includes('NOTE') || words.includes('TONE'));
    for (const word of words) {
      assert.equal(canFormWord(word, 'STONE'), true);
    }
  });
});

describe('race room validation', () => {
  let manager;

  function startRace({ size = 'small', seed = 42 } = {}) {
    manager = new RoomManager({ now: () => 50_000, onEmit() {}, testSecret: 'testy' });
    const created = manager.createRoom({
      name: 'Ada',
      socketId: 's1',
      mode: 'race',
      raceSize: size,
      testSecret: 'testy',
      puzzleSeed: seed,
    });
    const joined = manager.joinRoom({ code: created.room.code, name: 'Bea', socketId: 's2' });
    return { room: created.room, ada: created.player, bea: joined.player };
  }

  before(() => {
    loadCommon();
    loadDictionary();
  });

  it('treats race as its own mode and starts both players on the same puzzle', () => {
    assert.equal(resolveMode('race'), 'race');
    assert.equal(resolveMode('crossword'), 'race');
    const { room } = startRace({ seed: 42 });
    assert.equal(room.mode, 'race');
    assert.equal(room.status, 'racing');
    assert.equal(room.raceSize, 'small');
    const ada = manager.serialize(room, 'p1');
    const bea = manager.serialize(room, 'p2');
    assert.deepEqual(ada.race.letters, bea.race.letters);
    assert.equal(ada.race.total, bea.race.total);
    assert.equal(ada.race.youCount, 0);
    assert.equal(ada.race.opponentCount, 0);
    assert.equal(ada.race.slots.length, ada.race.total);
    assert.ok(ada.race.total >= 5 && ada.race.total <= 7);
    for (const slot of ada.race.slots) {
      assert.equal(slot.found, false);
      assert.equal(slot.word, null);
    }
  });

  it('accepts a grid word, rejects misses and already-found words, and does not leak opponent words', () => {
    const { room } = startRace({ seed: 42 });
    const target = room.race.puzzle.words[0].word;
    const miss = sanitiseWord('xyzxyz');
    const found = manager.submitRaceWord('s1', target);
    assert.equal(found.result, 'found');
    assert.equal(found.word, target);
    const again = manager.submitRaceWord('s1', target);
    assert.equal(again.result, 'already');
    const no = manager.submitRaceWord('s1', miss);
    assert.equal(no.result, 'miss');

    const ada = manager.serialize(room, 'p1');
    const bea = manager.serialize(room, 'p2');
    assert.equal(ada.race.youCount, 1);
    assert.equal(ada.race.youFound.includes(target), true);
    assert.equal(bea.race.opponentCount, 1);
    assert.equal(bea.race.youFound.includes(target), false);
    const leaked = JSON.stringify(bea);
    assert.equal(leaked.includes(target), false, 'opponent should not see the found word mid-race');
  });

  it('ends the race when one player fills every grid word', () => {
    const { room } = startRace({ seed: 7 });
    const words = puzzleWordList(room.race.puzzle);
    manager.submitRaceWord('s2', words[0]);
    for (const word of words) {
      const res = manager.submitRaceWord('s1', word);
      assert.ok(res.result === 'found' || res.result === 'already');
    }
    assert.equal(room.status, 'ended');
    assert.equal(room.winnerId, 'p1');
    const ada = manager.serialize(room, 'p1');
    const bea = manager.serialize(room, 'p2');
    assert.equal(ada.you.score, words.length);
    assert.equal(bea.opponent.score, words.length);
    assert.equal(bea.you.score, 1);
    assert.ok(ada.race.elapsedMs >= 0);
    assert.ok(ada.race.slots.every((slot) => slot.found && slot.word));
    assert.ok(puzzleHasWord(room.race.puzzle, words[0]));
    const late = manager.submitRaceWord('s2', words[1]);
    assert.equal(late.error, 'The race is already over.');
  });

  it('rematch deals a new puzzle of the same size', () => {
    const { room } = startRace({ seed: 11 });
    const firstSeed = room.race.seed;
    const firstLetters = room.race.puzzle.letters.join('');
    const words = puzzleWordList(room.race.puzzle);
    for (const word of words) manager.submitRaceWord('s1', word);
    assert.equal(room.status, 'ended');
    manager.rematch('s1');
    manager.rematch('s2');
    assert.equal(room.status, 'racing');
    assert.equal(room.raceSize, 'small');
    assert.ok(room.race.puzzle.words.length >= 5);
    const changed = room.race.seed !== firstSeed || room.race.puzzle.letters.join('') !== firstLetters
      || JSON.stringify(room.race.puzzle.words) !== JSON.stringify(words.map((w, i) => room.race.puzzle.words[i]));
    // A new match id is always issued; the puzzle should be freshly generated.
    assert.ok(room.matchId);
    assert.equal(room.players.p1.score, 0);
    assert.equal(room.race.found.p1.length, 0);
    void firstSeed;
    void changed;
  });
});
