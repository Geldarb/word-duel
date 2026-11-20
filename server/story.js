import { randomInt } from 'node:crypto';

export const MAX_ANSWER_LEN = 30;
export const STORY_LENGTHS = Object.freeze([5, 8]);
export const DEFAULT_STORY_LENGTH = 5;
export const STORY_FILL_SECONDS = 180;
export const VOTE_REVEAL_MS = 2800;
export const VERSION_KEYS = Object.freeze(['peach', 'blossom']);
export const VERSION_LABELS = Object.freeze({
  peach: 'Version 🍑',
  blossom: 'Version 🌸',
});

export const PROMPT_LABELS = Object.freeze({
  noun: 'a noun',
  plural: 'a plural noun',
  verbing: 'a silly verb ending in -ing',
  verb: 'a verb',
  place: 'a place',
  adjective: 'an adjective',
  body: 'a body part',
  person: 'a famous person',
  sound: 'a sound',
  food: 'a food',
  animal: 'an animal',
  clothing: 'a piece of clothing',
  exclamation: 'an exclamation',
  emotion: 'an emotion',
  job: 'a job',
  vehicle: 'a vehicle',
  colour: 'a colour',
});

export const FALLBACK_WORDS = Object.freeze({
  noun: ['a custard teapot', 'a rubber duck', 'a mysterious sock', 'a velvet trombone', 'a haunted biscuit', 'an emergency lampshade', 'a slightly damp secret'],
  plural: ['soggy crisps', 'tiny trombones', 'runaway spoons', 'polite bees', 'lost umbrellas', 'dramatic pigeons', 'sparkly wellies'],
  verbing: ['pirouetting', 'yodelling', 'power-walking', 'moonwalking', 'jiggling', 'whisper-shouting', 'interpretive-dancing'],
  verb: ['tickle', 'serenade', 'nibble', 'yeet', 'befriend', 'unravel', 'politely tackle'],
  place: ['a rainy bus stop', 'the shed of destiny', 'a suspiciously fancy car park', 'the back of a biscuit tin', 'a misty chip shop', 'the moon\'s gift shop', 'a library after closing'],
  adjective: ['glittery', 'slightly cursed', 'overly dramatic', 'soggy', 'magnificent', 'unreasonably proud', 'quietly chaotic'],
  body: ['left elbow', 'nose', 'little toe', 'eyebrow', 'funny bone', 'earlobe', 'kneecap'],
  person: ['the Queen of Crisps', 'a celebrity plumber', 'mysterious Auntie Pat', 'the Mayor of Slightly Lost', 'a famous accordionist', 'last Tuesday\'s weather presenter', 'an unnamed national treasure'],
  sound: ['a tiny kazoo', 'a heroic burp', 'polite thunder', 'a wet trombone', 'distant spoons', 'a gasp in surround sound', 'an optimistic honk'],
  food: ['a lukewarm pasty', 'custard', 'a rebellious sausage', 'midnight toast', 'pickled onions', 'a ceremonial crumpet', 'emergency chocolate'],
  animal: ['a judgemental cat', 'a formal goose', 'a shy badger', 'an ambitious pigeon', 'a philosophical goldfish', 'a jazz-loving ferret', 'a posh hamster'],
  clothing: ['a sequinned anorak', 'one dramatic sock', 'a velvet cape', 'questionable shorts', 'a lucky cardigan', 'opera gloves', 'a hat with opinions'],
  exclamation: ['Good grief', 'By these biscuits', 'Oh crumbs', 'Heavens to gravy', 'Well I never', 'Crikey', 'Bless my toast'],
  emotion: ['unearned confidence', 'mild panic', 'secret delight', 'theatrical sorrow', 'suspicious joy', 'brave confusion', 'cosy rage'],
  job: ['professional napper', 'part-time dragon', 'sandwich critic', 'cloud shepherd', 'emergency poet', 'junior wizard', 'crisp ambassador'],
  vehicle: ['a rusty tandem', 'the number 42 bus', 'a shopping trolley with dreams', 'a very small canoe', 'a golden mobility scooter', 'a confused taxi', 'a biscuit tin with wheels'],
  colour: ['peach', 'customary beige', 'emergency pink', 'midnight custard', 'slightly illegal green', 'theatrical mauve', 'rainy-day orange'],
});

const OPENINGS = [
  'Once upon a soggy Tuesday, {person} was {verbing} through {place}.',
  'In the kingdom of slightly burnt toast, {person} woke up feeling {adjective}.',
  'Legend has it that {person} first appeared in {place}, clutching {noun}.',
  'It was a {adjective} morning when {animal} delivered a letter to {place}.',
  'Nobody expected {person} to arrive at {place} in {vehicle}.',
  'The tale begins with {sound}, followed by {exclamation}.',
  'At exactly teatime, {job} walked into {place} wearing {clothing}.',
  'Long ago, or possibly last Thursday, {person} tried to {verb} {noun}.',
  'A rumour spread through {place} that {person} had become {adjective}.',
  'The weather was the colour of {colour} when {animal} started {verbing}.',
  'There once lived {job} whose greatest love was {food}.',
  'Our story opens in {place}, where everything smelled faintly of {food}.',
  '{exclamation}! That was the first thing {person} said in {place}.',
  'Between the hours of nonsense and supper, {person} discovered {noun}.',
  'A small sign in {place} simply read: Beware of {plural}.',
  'On the last train to {place}, {person} sat next to {animal}.',
  'It began, as these things often do, with {sound} and a plate of {food}.',
  'Nobody in {place} could explain why {person} was {verbing} at dawn.',
  'The invitation was written in {colour} ink and signed by {person}.',
  'Before the credits even rolled, {animal} had already stolen {clothing}.',
];

const MIDDLES = [
  'Without warning, they decided to {verb} {noun} with their {body}.',
  'A passing {animal} whispered, {exclamation}, and offered {food}.',
  'This caused {emotion} in everyone who owned {plural}.',
  'Meanwhile, {person} was busy {verbing} on top of {vehicle}.',
  'The only clue was {adjective} stain the colour of {colour}.',
  'They paused to {verb} a little, then hid {noun} inside {clothing}.',
  'From somewhere nearby came {sound}, which made their {body} twitch.',
  'A helpful {job} suggested they travel to {place} immediately.',
  'Unfortunately the map was printed on {food} and tasted {adjective}.',
  'They swore an oath, quite dramatically, never to {verb} {animal} again.',
  'In a subplot nobody asked for, {plural} began {verbing} in formation.',
  'The local news described the event as {adjective} and slightly moist.',
  'Someone had replaced the door with {noun}, which was inconvenient.',
  'They packed {clothing}, a spare {body}, and far too many {plural}.',
  'A mysterious bill arrived, payable in {food}, addressed to {person}.',
  'At this point the plot tripped over {noun} and fell into {place}.',
  'They tried to remain dignified while {verbing} in {vehicle}.',
  'History would later record the smell as {adjective} with notes of {food}.',
  'A choir of {plural} sang in the key of {sound}.',
  '{exclamation}, muttered {job}, adjusting their {clothing}.',
  'The rules were simple: do not {verb} the {animal}, and never trust {noun}.',
  'All fingers, and one {body}, pointed towards {place}.',
  'They felt {emotion} and also a bit peckish for {food}.',
  'By noon, {person} had declared themselves the official {job}.',
  'A raffle was held. First prize was {noun}. Second prize was {emotion}.',
  'The paint dried in a shade of {colour}, which felt personally rude.',
  'They left a trail of {plural} all the way to {place}.',
  'Then came the twist: {noun} had been {adjective} the entire time.',
  'In a tender moment, they used their {body} to {verb} {food}.',
  'Security was a single {animal} wearing {clothing}.',
  'The instruction manual contained only the word {exclamation} and a drawing of {vehicle}.',
  'A debate broke out over whether {sound} counted as {emotion}.',
  'They posted a review: five stars, would {verb} again, terrible {plural}.',
  'Across town, {person} was already {verbing} for charity.',
  'The ancient prophecy mentioned {job}, {food}, and absolutely no common sense.',
  'Lightning, or possibly {sound}, struck a nearby {noun}.',
  'They attempted diplomacy by offering {animal} a bit of {clothing}.',
  'Nothing could have prepared {place} for this many {plural}.',
  'A tiny orchestra hidden in {vehicle} played something {adjective}.',
  'Their {body} still remembered the last time they tried to {verb} {noun}.',
];

const ENDINGS = [
  'And so they lived, if not happily, then at least {adjective} ever after.',
  'In the end, {place} was saved by {noun} and a well-timed {sound}.',
  'They married {animal} in a ceremony catered entirely with {food}.',
  'The moral, if there was one, was never to {verb} {person}.',
  'Credits rolled while {job} quietly ate the last of the {plural}.',
  'And that, dear listener, is why {place} still smells of {food}.',
  'They waved goodbye with their {body} and vanished in {vehicle}.',
  'Forever after, children would whisper {exclamation} whenever they saw {noun}.',
  'Peace returned, slightly {adjective}, and the {animal} took a nap.',
  'The statue they built was the colour of {colour} and shaped like {clothing}.',
  'Finally, {person} hung up their hat and became a professional {job}.',
  'As the sun set, everyone agreed the real treasure had been {emotion}.',
  'They published a memoir called How I Learned to {verb} My {body}.',
  'And if you listen closely in {place}, you can still hear {sound}.',
  'The curtain fell. Someone had left {noun} on the seat, obviously on purpose.',
  'So ended the affair of the {adjective} {plural}, thanks to {person}.',
  'They rode off, {verbing} into a sky the colour of {colour}.',
  'No one was injured, except perhaps {body}, and dinner was {food}.',
];

const FLAVOUR = [
  'A passing cloud nodded, as if it had seen this sort of thing before.',
  'The narrator coughed politely and continued.',
  'Somewhere, a kettle reached its own conclusions.',
  'This next part is true, or at least confidently invented.',
  'A small orchestra tuned up and then thought better of it.',
  'Time passed, as it tends to when nobody is watching the biscuits.',
  'The audience leaned in. A chair creaked on purpose.',
  'Let us not dwell on the paperwork.',
  'Even the footnotes looked embarrassed.',
  'And then, because the universe has a sense of humour:',
  'Pause for dramatic tea.',
  'Scientists later refused to comment.',
  'A dog in the distance declined to be involved.',
  'The plot thickened, then immediately thinned again.',
  'Please hold your gasps until the official gasp mark.',
];

const ONE_BLANK = [
  'Then, quite unexpectedly, there was {noun}.',
  'Someone shouted {exclamation} from a window.',
  'The atmosphere could only be described as {adjective}.',
  'A close-up revealed {body} in alarming detail.',
  'They made a mental note to {verb} later.',
  'In the distance: {sound}.',
  'This would not have happened without {person}.',
  'The official snack was {food}.',
  'All roads seemed to lead to {place}.',
  'A lone {animal} took notes.',
  'Fashion-wise, it was all about {clothing}.',
  'Employment opportunities included {job}.',
  'The recommended colour for heroics was {colour}.',
  'Transport was provided by {vehicle}.',
  'They were last seen {verbing}.',
  'A box arrived, labelled {plural}.',
  'The prevailing mood was {emotion}.',
];

export function sanitiseAnswer(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ANSWER_LEN);
}

export function sanitiseAnswers(list, expectedLength) {
  const n = Number(expectedLength) || 0;
  const src = Array.isArray(list) ? list : [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(sanitiseAnswer(src[i]));
  return out;
}

export function answersComplete(answers) {
  return Array.isArray(answers) && answers.length > 0 && answers.every((a) => String(a || '').trim().length > 0);
}

export function resolveStoryLength(value) {
  const n = Number(value);
  return n === 8 ? 8 : 5;
}

export function blankTypesIn(template) {
  const types = [];
  const re = /\{([a-z]+)\}/g;
  let m;
  while ((m = re.exec(template))) {
    if (!PROMPT_LABELS[m[1]]) {
      throw new Error(`Unknown prompt type: ${m[1]} in "${template}"`);
    }
    types.push(m[1]);
  }
  return types;
}

export function fallbackWord(type, rng = Math.random) {
  const list = FALLBACK_WORDS[type] || FALLBACK_WORDS.noun;
  return list[Math.floor(rng() * list.length)] || 'a mysterious thing';
}

export function autoFillAnswers(blanks, existing, rng = Math.random) {
  return blanks.map((blank, i) => {
    const current = sanitiseAnswer(existing?.[i]);
    return current || fallbackWord(blank.type, rng);
  });
}

export function renderLine(template, answers) {
  let i = 0;
  return String(template).replace(/\{[a-z]+\}/g, () => {
    const a = sanitiseAnswer(answers?.[i++]);
    return a || '____';
  });
}

export function renderLineWithNumbers(template) {
  let i = 0;
  return String(template).replace(/\{[a-z]+\}/g, () => `[${++i}]`);
}

export function renderStoryText(lines, answers, blanks) {
  const byIndex = [];
  (blanks || []).forEach((blank, i) => {
    byIndex[i] = sanitiseAnswer(answers?.[i]);
  });
  let cursor = 0;
  return (lines || []).map((line) => {
    const slice = byIndex.slice(cursor, cursor + line.blanks.length);
    cursor += line.blanks.length;
    return renderLine(line.template, slice);
  }).join(' ');
}

function parseTemplate(template, role) {
  const types = blankTypesIn(template);
  return { template, role, types, blankCount: types.length };
}

const BANK = {
  opening: OPENINGS.map((t) => parseTemplate(t, 'opening')),
  middle: MIDDLES.map((t) => parseTemplate(t, 'middle')),
  ending: ENDINGS.map((t) => parseTemplate(t, 'ending')),
  flavour: FLAVOUR.map((t) => parseTemplate(t, 'flavour')),
  patch: ONE_BLANK.map((t) => parseTemplate(t, 'patch')),
};

export function storyBankSize() {
  return Object.values(BANK).reduce((n, list) => n + list.length, 0);
}

function defaultRand() {
  return randomInt(1_000_000_000) / 1_000_000_000;
}

export function makeRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(list, rng) {
  const items = list.slice();
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function tryAssemble(target, rng) {
  const opening = pick(BANK.opening, rng);
  const ending = pick(BANK.ending, rng);
  const middles = shuffle(BANK.middle, rng);
  const patches = shuffle(BANK.patch, rng);
  const chosen = [opening];
  let total = opening.blankCount;
  for (const mid of middles) {
    if (total + mid.blankCount + ending.blankCount <= target) {
      chosen.push(mid);
      total += mid.blankCount;
    }
  }
  if (total + ending.blankCount <= target) {
    chosen.push(ending);
    total += ending.blankCount;
  }
  let p = 0;
  while (total < target && p < patches.length) {
    chosen.splice(Math.max(1, chosen.length - 1), 0, patches[p]);
    total += patches[p].blankCount;
    p += 1;
  }
  if (total !== target) return null;
  return chosen;
}

function stampLines(parts, rng) {
  const flavour = shuffle(BANK.flavour, rng);
  const lines = [];
  let flavourIndex = 0;
  let blankCursor = 0;
  parts.forEach((part, partIndex) => {
    if (partIndex > 0 && flavourIndex < flavour.length && rng() < 0.55) {
      lines.push({
        template: flavour[flavourIndex].template,
        role: 'flavour',
        blanks: [],
      });
      flavourIndex += 1;
    }
    const blanks = part.types.map((type) => {
      const id = `b${blankCursor}`;
      blankCursor += 1;
      return { id, type, prompt: PROMPT_LABELS[type] };
    });
    lines.push({
      template: part.template,
      role: part.role,
      blanks,
    });
  });
  return lines;
}

export function generateStory(length = DEFAULT_STORY_LENGTH, rng = defaultRand) {
  const target = resolveStoryLength(length);
  const roll = typeof rng === 'function' ? rng : defaultRand;
  let parts = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    parts = tryAssemble(target, roll);
    if (parts) break;
  }
  if (!parts) {
    const patches = shuffle(BANK.patch, roll);
    parts = patches.slice(0, target);
  }
  const lines = stampLines(parts, roll);
  const blanks = [];
  lines.forEach((line, lineIndex) => {
    line.blanks.forEach((blank) => {
      blanks.push({ ...blank, lineIndex });
    });
  });
  return {
    length: target,
    lines,
    blanks,
  };
}

export function voteLineIndexes(story) {
  return story.lines
    .map((line, i) => (line.blanks.length ? i : -1))
    .filter((i) => i >= 0);
}

export function answersForLine(story, answers, lineIndex) {
  const line = story.lines[lineIndex];
  if (!line) return [];
  const start = story.blanks.findIndex((b) => b.lineIndex === lineIndex);
  return (line.blanks || []).map((_, i) => sanitiseAnswer(answers?.[start + i]));
}

export function preambleLines(story, lineIndex, answers) {
  const text = [];
  for (let i = lineIndex - 1; i >= 0; i--) {
    if (story.lines[i].blanks.length) break;
    text.unshift(story.lines[i].template);
  }
  void answers;
  return text;
}

export function fingerprintStory(story) {
  return story.lines.map((l) => l.template).join('|');
}
