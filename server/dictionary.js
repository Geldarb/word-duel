import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const words = new Set();
const slang = new Set();

function loadWordFile(file, set) {
  const text = fs.readFileSync(file, 'utf8');
  set.clear();
  for (const line of text.split(/\n/)) {
    const w = line.trim().toLowerCase();
    if (w) set.add(w);
  }
  return set.size;
}

export function loadDictionary() {
  return loadWordFile(path.join(__dirname, '..', 'data', 'words.txt'), words);
}

export function loadSlang() {
  return loadWordFile(path.join(__dirname, '..', 'data', 'slang.txt'), slang);
}

export function isValidWord(word) {
  if (!word) return false;
  return words.has(String(word).toLowerCase());
}

export function isSlangWord(word) {
  if (!word) return false;
  return slang.has(String(word).toLowerCase());
}

export function dictionarySize() {
  return words.size;
}

export function slangSize() {
  return slang.size;
}
