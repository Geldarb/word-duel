import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadDictionary, loadSlang } from '../server/dictionary.js';
import {
  generateStory,
  makeRng,
  storyBankSize,
  sanitiseAnswer,
  sanitiseAnswers,
  answersComplete,
  autoFillAnswers,
  renderLine,
  renderStoryText,
  voteLineIndexes,
  fingerprintStory,
  PROMPT_LABELS,
  MAX_ANSWER_LEN,
} from '../server/story.js';
import {
  scoreWord,
  scoreWordWithBonus,
  assignBonus,
  bonusApplies,
  mustHaveUsedBonus,
  judgeWord,
  RoomManager,
  SLANG_BONUS,
  LETTER_VALUES,
} from '../server/game.js';

describe('story generation', () => {
  it('has a large original bank of fragments', () => {
    assert.ok(storyBankSize() >= 80, `bank size ${storyBankSize()}`);
  });

  it('builds stories with exactly 5 or 8 blanks and known prompts', () => {
    for (const length of [5, 8]) {
      for (let i = 0; i < 40; i++) {
        const story = generateStory(length, makeRng(1000 + length * 100 + i));
        assert.equal(story.length, length);
        assert.equal(story.blanks.length, length);
        assert.ok(voteLineIndexes(story).length >= 1);
        for (const blank of story.blanks) {
          assert.equal(blank.prompt, PROMPT_LABELS[blank.type]);
          assert.ok(PROMPT_LABELS[blank.type], blank.type);
        }
        const text = renderStoryText(story.lines, story.blanks.map(() => 'WIDGET'), story.blanks);
        assert.ok(text.includes('WIDGET'));
        assert.equal((text.match(/WIDGET/g) || []).length, length);
      }
    }
  });

  it('varies a lot from one match to the next', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      seen.add(fingerprintStory(generateStory(5, makeRng(i + 7))));
    }
    assert.ok(seen.size >= 40, `only ${seen.size} unique 5-blank stories`);
  });

  it('sanitises free-text answers and auto-fills empties', () => {
    assert.equal(sanitiseAnswer('  hello\nworld  '), 'hello world');
    assert.equal(sanitiseAnswer('x'.repeat(40)).length, MAX_ANSWER_LEN);
    const story = generateStory(5, makeRng(1));
    const filled = autoFillAnswers(story.blanks, ['  duck  ', '', '  ', null, 'already set'], makeRng(2));
    assert.equal(filled[0], 'duck');
    assert.equal(filled[4], 'already set');
    assert.ok(filled[1].length > 0 && filled[2].length > 0);
    assert.equal(answersComplete(sanitiseAnswers(['a', 'b', 'c', 'd', 'e'], 5)), true);
    assert.equal(answersComplete(sanitiseAnswers(['a', '', 'c', 'd', 'e'], 5)), false);
  });
});

describe('bonus tile scoring', () => {
  before(() => {
    loadDictionary();
    loadSlang();
  });

  it('doubles one letter for DL when that tile is used', () => {
    const letters = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
    const bonus = { type: 'DL', index: 2 }; // T
    const scored = scoreWordWithBonus('CAT', letters, bonus, [0, 1, 2]);
    assert.equal(scored.applied, true);
    assert.equal(scored.score, LETTER_VALUES.C + LETTER_VALUES.A + LETTER_VALUES.T * 2);
    assert.equal(scored.breakdown.wordMultiplier, 1);
    assert.equal(scored.breakdown.letters[2].doubled, true);
  });

  it('does not apply DL when the bonus tile is left unused', () => {
    const letters = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
    const bonus = { type: 'DL', index: 3 }; // S, not used in CAT
    const scored = scoreWordWithBonus('CAT', letters, bonus, [0, 1, 2]);
    assert.equal(scored.applied, false);
    assert.equal(scored.score, scoreWord('CAT'));
  });

  it('doubles the whole word for DW when the marked tile is used', () => {
    const letters = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
    const bonus = { type: 'DW', index: 0 }; // C
    const scored = scoreWordWithBonus('CAT', letters, bonus, [0, 1, 2]);
    assert.equal(scored.applied, true);
    assert.equal(scored.score, scoreWord('CAT') * 2);
    assert.equal(scored.breakdown.wordMultiplier, 2);
  });

  it('is conservative when tile indexes are missing and the letter is ambiguous', () => {
    const letters = ['E', 'A', 'T', 'E', 'R', 'S', 'N'];
    const bonus = { type: 'DL', index: 3 }; // second E
    assert.equal(mustHaveUsedBonus('ATE', letters, bonus), false);
    assert.equal(bonusApplies('ATE', letters, bonus, null), false);
    assert.equal(scoreWordWithBonus('ATE', letters, bonus, null).applied, false);
    assert.equal(bonusApplies('EATEN', letters, bonus, null), true);
  });

  it('adds slang +2 after the letter or word bonus in Fun mode', () => {
    const letters = ['R', 'I', 'Z', 'Z', 'Y', 'E', 'T'];
    const bonus = { type: 'DW', index: 0 };
    const judged = judgeWord('RIZZ', letters, { funMode: true, bonus, usedIndexes: [0, 1, 2, 3] });
    assert.equal(judged.valid, true);
    assert.equal(judged.slang, true);
    assert.equal(judged.score, scoreWord('RIZZ') * 2 + SLANG_BONUS);
  });

  it('assigns either DL or DW on a valid tile index', () => {
    const types = new Set();
    for (let i = 0; i < 80; i++) {
      const bonus = assignBonus(7, () => (i % 2 === 0 ? 0.01 : 0.9));
      types.add(bonus.type);
      assert.ok(bonus.index >= 0 && bonus.index < 7);
    }
    assert.ok(types.has('DL') && types.has('DW'));
  });
});

function storyRoom(options = {}) {
  const now = { t: options.now || 50_000 };
  const manager = new RoomManager({
    now: () => now.t,
    testSecret: 'secret',
    fillSeconds: 30,
    turnSeconds: 60,
    onEmit() {},
  });
  const created = manager.createRoom({
    name: 'Ada',
    socketId: 's1',
    mode: 'story',
    storyLength: options.storyLength || 5,
    testSecret: 'secret',
    fillSeconds: options.fillSeconds || 30,
  });
  const room = created.room;
  manager.joinRoom({ code: room.code, name: 'Bea', socketId: 's2' });
  manager._clearTimers(room.code);
  return { manager, room, now };
}

function leakHaystack(state) {
  return JSON.stringify(state);
}

describe('story duel hidden answers and voting', () => {
  it('starts a shared story and never sends the opponent\'s answers during the fill', () => {
    const { manager, room } = storyRoom();
    assert.equal(room.status, 'filling');
    assert.equal(room.mode, 'story');
    assert.equal(room.story.blanks.length, 5);
    const answers = room.story.blanks.map((_, i) => `AdaWord${i}`);
    const result = manager.submitStory('s1', answers);
    assert.equal(result.ok, true);
    assert.equal(room.status, 'filling');

    const forBea = manager.serialize(room, 'p2');
    const forAda = manager.serialize(room, 'p1');
    assert.equal(forBea.story.phase, 'fill');
    assert.equal(forBea.story.opponentSubmitted, true);
    assert.equal(forBea.story.youSubmitted, false);
    assert.equal(forAda.story.youSubmitted, true);
    assert.deepEqual(forAda.story.yourAnswers, answers);
    const beaJson = leakHaystack(forBea);
    for (const word of answers) {
      assert.equal(beaJson.includes(word), false, `Bea state leaked ${word}`);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(forBea.story, 'opponentAnswers'), false);
    assert.ok(!beaJson.includes('AdaWord'));
    // Bea has empty own answers
    assert.ok(forBea.story.yourAnswers.every((a) => a === ''));
  });

  it('starts the reveal only after both have submitted, still anonymous until votes are in', () => {
    const { manager, room } = storyRoom();
    const adaAnswers = room.story.blanks.map((_, i) => `Peach${i}`);
    const beaAnswers = room.story.blanks.map((_, i) => `Bloom${i}`);
    manager.submitStory('s1', adaAnswers);
    manager.submitStory('s2', beaAnswers);
    assert.equal(room.status, 'revealing');

    const forAda = manager.serialize(room, 'p1');
    const forBea = manager.serialize(room, 'p2');
    assert.equal(forAda.story.phase, 'reveal');
    assert.equal(forAda.story.subphase, 'vote');
    assert.equal(forAda.story.currentLine.versions.length, 2);
    const keys = forAda.story.currentLine.versions.map((v) => v.key).sort();
    assert.deepEqual(keys, ['blossom', 'peach']);
    for (const state of [forAda, forBea]) {
      for (const ver of state.story.currentLine.versions) {
        assert.equal(ver.playerId, undefined);
        assert.equal(ver.yours, undefined);
        assert.equal(ver.name, undefined);
        assert.ok(ver.text.length > 0);
      }
    }
    // Both players see the same anonymous versions, in the same order
    assert.deepEqual(
      forAda.story.currentLine.versions.map((v) => v.text),
      forBea.story.currentLine.versions.map((v) => v.text),
    );
  });

  it('tallies anonymous votes and then reveals whose line was whose', () => {
    const { manager, room } = storyRoom();
    manager.submitStory('s1', room.story.blanks.map(() => 'custard'));
    manager.submitStory('s2', room.story.blanks.map(() => 'sausage'));
    const first = manager.serialize(room, 'p1');
    const peachAuthor = room.story.versionOrder[0];
    const blossomAuthor = room.story.versionOrder[1];

    // Both vote for peach
    assert.equal(manager.voteStory('s1', 'peach').ok, true);
    assert.equal(manager.voteStory('s2', 'peach').ok, true);
    assert.equal(room.story.voteReveal, true);
    assert.equal(room.players[peachAuthor].score, 2);
    assert.equal(room.players[blossomAuthor].score, 0);

    const after = manager.serialize(room, 'p1');
    assert.equal(after.story.subphase, 'authors');
    assert.equal(after.story.tally.peach, 2);
    assert.equal(after.story.tally.blossom, 0);
    const peach = after.story.currentLine.versions.find((v) => v.key === 'peach');
    const blossom = after.story.currentLine.versions.find((v) => v.key === 'blossom');
    assert.equal(peach.playerId, peachAuthor);
    assert.equal(blossom.playerId, blossomAuthor);
    assert.equal(typeof peach.yours, 'boolean');
    assert.equal(typeof peach.name, 'string');
  });

  it('auto-fills remaining blanks when the fill timer runs out', () => {
    const { manager, room, now } = storyRoom({ fillSeconds: 5 });
    manager.submitStory('s1', room.story.blanks.map(() => 'prepared'));
    now.t += 6_000;
    manager._timeoutFill(room);
    assert.equal(room.story.submitted.p2, true);
    assert.equal(room.story.autoFilled.p2, true);
    assert.ok(room.story.answers.p2.every((a) => a.length > 0));
    assert.equal(room.status, 'revealing');
  });

  it('plays a full five-blank match to a winner or a draw', () => {
    const { manager, room } = storyRoom();
    manager.submitStory('s1', room.story.blanks.map((b, i) => `Ada${i}`));
    manager.submitStory('s2', room.story.blanks.map((b, i) => `Bea${i}`));
    const lineCount = room.story.voteLines.length;
    for (let i = 0; i < lineCount; i++) {
      assert.equal(room.status, 'revealing');
      manager.voteStory('s1', 'peach');
      manager.voteStory('s2', 'blossom');
      // skip the auto-advance timer
      manager._clearTimers(room.code);
      if (i < lineCount - 1) manager._beginRevealLine(room, i + 1);
      else manager._endGame(room);
    }
    assert.equal(room.status, 'ended');
    const ended = manager.serialize(room, 'p1');
    assert.equal(ended.story.phase, 'ended');
    assert.ok(ended.story.fullStories.you.includes('Ada0') || ended.story.fullStories.you.includes('Ada'));
    assert.ok(ended.story.fullStories.opponent.length > 0);
    assert.equal(ended.you.score + ended.opponent.score, lineCount * 2);
  });
});
