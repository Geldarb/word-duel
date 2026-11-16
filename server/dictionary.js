import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const words = new Set();

export function loadDictionary() {
  const file = path.join(__dirname, '..', 'data', 'words.txt');
  const text = fs.readFileSync(file, 'utf8');
  words.clear();
  for (const line of text.split(/\n/)) {
    const w = line.trim().toLowerCase();
    if (w) words.add(w);
  }
  return words.size;
}

export function isValidWord(word) {
  if (!word) return false;
  return words.has(String(word).toLowerCase());
}

export function dictionarySize() {
  return words.size;
}
