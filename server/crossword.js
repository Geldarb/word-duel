import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RACE_SIZES = Object.freeze({
  small: Object.freeze({ wheel: 5, minWords: 5, maxWords: 7 }),
  medium: Object.freeze({ wheel: 6, minWords: 8, maxWords: 10 }),
});

export const MIN_RACE_WORD_LEN = 3;
export const MAX_GRID_DIM = 12;

const common = new Set();
const byLength = new Map();

export function loadCommon() {
  const file = path.join(__dirname, '..', 'data', 'common.txt');
  const text = fs.readFileSync(file, 'utf8');
  common.clear();
  byLength.clear();
  for (const line of text.split(/\n/)) {
    const w = line.trim().toLowerCase();
    if (!w || !/^[a-z]{3,6}$/.test(w)) continue;
    common.add(w);
    let bucket = byLength.get(w.length);
    if (!bucket) {
      bucket = [];
      byLength.set(w.length, bucket);
    }
    bucket.push(w);
  }
  for (const bucket of byLength.values()) bucket.sort();
  return common.size;
}

export function commonSize() {
  return common.size;
}

export function isCommonWord(word) {
  if (!word) return false;
  return common.has(String(word).toLowerCase());
}

export function resolveRaceSize(size) {
  return String(size || '').toLowerCase() === 'medium' ? 'medium' : 'small';
}

export function createRng(seed) {
  let a = Number(seed);
  if (!Number.isFinite(a) || a === 0) a = 1;
  a >>>= 0;
  if (a === 0) a = 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, n) {
  if (n <= 0) return 0;
  return Math.floor(rng() * n);
}

export function shuffleCopy(items, rng) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function canFormWord(word, letters) {
  const bag = Object.create(null);
  for (const ch of letters) {
    const key = String(ch).toLowerCase();
    bag[key] = (bag[key] || 0) + 1;
  }
  for (const ch of String(word).toLowerCase()) {
    if (!bag[ch]) return false;
    bag[ch] -= 1;
  }
  return true;
}

export function subwordsFor(letters, { minLen = MIN_RACE_WORD_LEN } = {}) {
  if (!common.size) loadCommon();
  const maxLen = letters.length;
  const found = [];
  for (let len = minLen; len <= maxLen; len++) {
    const bucket = byLength.get(len) || [];
    for (const word of bucket) {
      if (canFormWord(word, letters)) found.push(word.toUpperCase());
    }
  }
  return found;
}

function cellKey(row, col) {
  return `${row},${col}`;
}

function cellsOf(placement) {
  const cells = [];
  const dr = placement.dir === 'down' ? 1 : 0;
  const dc = placement.dir === 'across' ? 1 : 0;
  for (let i = 0; i < placement.word.length; i++) {
    cells.push([placement.row + dr * i, placement.col + dc * i, placement.word[i]]);
  }
  return cells;
}

function stamp(placement, grid) {
  for (const [row, col, letter] of cellsOf(placement)) {
    grid.set(cellKey(row, col), letter);
  }
}

function boundsOf(placements) {
  let minR = Infinity;
  let minC = Infinity;
  let maxR = -Infinity;
  let maxC = -Infinity;
  for (const place of placements) {
    for (const [row, col] of cellsOf(place)) {
      if (row < minR) minR = row;
      if (col < minC) minC = col;
      if (row > maxR) maxR = row;
      if (col > maxC) maxC = col;
    }
  }
  if (!Number.isFinite(minR)) return { minR: 0, minC: 0, rows: 0, cols: 0 };
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

function canPlace(word, row, col, dir, grid, placed) {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  if (grid.has(cellKey(row - dr, col - dc))) return false;
  if (grid.has(cellKey(row + dr * word.length, col + dc * word.length))) return false;

  let crosses = 0;
  const tentative = [];
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = grid.get(cellKey(r, c));
    if (existing) {
      if (existing !== word[i]) return false;
      crosses += 1;
    } else {
      const pr = dir === 'across' ? 1 : 0;
      const pc = dir === 'down' ? 1 : 0;
      if (grid.has(cellKey(r + pr, c + pc)) || grid.has(cellKey(r - pr, c - pc))) return false;
    }
    tentative.push([r, c]);
  }

  if (placed.length && crosses < 1) return false;

  const all = placed.concat([{ word, row, col, dir }]);
  const box = boundsOf(all);
  if (box.rows > MAX_GRID_DIM || box.cols > MAX_GRID_DIM) return false;
  return true;
}

function findPlacements(word, placed, grid) {
  const results = [];
  const seen = new Set();
  for (const existing of placed) {
    const newDir = existing.dir === 'across' ? 'down' : 'across';
    const edr = existing.dir === 'down' ? 1 : 0;
    const edc = existing.dir === 'across' ? 1 : 0;
    const ndr = newDir === 'down' ? 1 : 0;
    const ndc = newDir === 'across' ? 1 : 0;
    for (let i = 0; i < existing.word.length; i++) {
      for (let j = 0; j < word.length; j++) {
        if (existing.word[i] !== word[j]) continue;
        const row = existing.row + edr * i - ndr * j;
        const col = existing.col + edc * i - ndc * j;
        const key = `${row},${col},${newDir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (canPlace(word, row, col, newDir, grid, placed)) {
          results.push({ word, row, col, dir: newDir });
        }
      }
    }
  }
  return results;
}

function placementScore(place, placed) {
  const box = boundsOf(placed.concat([place]));
  return box.rows * box.cols * 10 + Math.max(box.rows, box.cols);
}

function pickPlacement(options, placed, rng) {
  let bestScore = Infinity;
  const best = [];
  for (const option of options) {
    const score = placementScore(option, placed);
    if (score < bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(option);
    } else if (score === bestScore) {
      best.push(option);
    }
  }
  return best[randInt(rng, best.length)];
}

function compact(placed) {
  const box = boundsOf(placed);
  return {
    words: placed.map((place) => ({
      word: place.word,
      row: place.row - box.minR,
      col: place.col - box.minC,
      dir: place.dir,
    })),
    rows: box.rows,
    cols: box.cols,
  };
}

export function cellsForWord(placement) {
  return cellsOf(placement).map(([row, col, letter]) => ({ row, col, letter }));
}

export function isConnectedPuzzle(words) {
  if (!words.length) return false;
  const sets = words.map((word) => new Set(cellsOf(word).map(([r, c]) => cellKey(r, c))));
  const parent = words.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      for (const key of sets[i]) {
        if (sets[j].has(key)) {
          union(i, j);
          break;
        }
      }
    }
  }
  const root = find(0);
  return words.every((_, i) => find(i) === root);
}

export function assertConsistentGrid(words) {
  const grid = new Map();
  for (const place of words) {
    for (const [row, col, letter] of cellsOf(place)) {
      const key = cellKey(row, col);
      const existing = grid.get(key);
      if (existing && existing !== letter) return false;
      grid.set(key, letter);
    }
  }
  for (const place of words) {
    const spelled = cellsOf(place).map(([, , letter]) => letter).join('');
    if (spelled !== place.word) return false;
  }
  return true;
}

function tryLayout(base, candidates, minWords, maxWords, rng) {
  const unique = [];
  const seen = new Set();
  for (const raw of [base, ...candidates]) {
    const word = String(raw).toUpperCase();
    if (seen.has(word)) continue;
    seen.add(word);
    unique.push(word);
  }
  const others = unique.filter((w) => w !== base);
  const ordered = shuffleCopy(others, rng).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return 0;
  });

  const startDir = rng() < 0.5 ? 'across' : 'down';
  const placed = [{ word: base, row: 0, col: 0, dir: startDir }];
  const grid = new Map();
  stamp(placed[0], grid);

  for (const word of ordered) {
    if (placed.length >= maxWords) break;
    const options = findPlacements(word, placed, grid);
    if (!options.length) continue;
    const picked = pickPlacement(options, placed, rng);
    placed.push(picked);
    stamp(picked, grid);
  }

  if (placed.length < minWords) return null;
  const used = placed.slice(0, maxWords);
  if (!isConnectedPuzzle(used) || !assertConsistentGrid(used)) return null;
  return compact(used);
}

export function generatePuzzle(size, seed = 1) {
  if (!common.size) loadCommon();
  const kind = resolveRaceSize(size);
  const cfg = RACE_SIZES[kind];
  const numericSeed = Number(seed);
  const useSeed = Number.isFinite(numericSeed) && numericSeed !== 0 ? (numericSeed >>> 0) || 1 : 1;
  const rng = createRng(useSeed);
  const bases = shuffleCopy(byLength.get(cfg.wheel) || [], rng);

  for (const baseLower of bases) {
    const letters = baseLower.toUpperCase().split('');
    const subs = subwordsFor(letters);
    if (subs.length < cfg.minWords) continue;
    if (!subs.includes(baseLower.toUpperCase())) continue;
    const layout = tryLayout(baseLower.toUpperCase(), subs, cfg.minWords, cfg.maxWords, rng);
    if (!layout) continue;
    const wheel = shuffleCopy(letters, rng);
    return {
      seed: useSeed,
      size: kind,
      letters: wheel,
      words: layout.words,
      rows: layout.rows,
      cols: layout.cols,
    };
  }
  throw new Error(`Could not generate a ${kind} crossword`);
}

export function puzzleWordList(puzzle) {
  return (puzzle?.words || []).map((w) => w.word);
}

export function puzzleHasWord(puzzle, word) {
  const target = String(word || '').toUpperCase();
  return (puzzle?.words || []).some((w) => w.word === target);
}
