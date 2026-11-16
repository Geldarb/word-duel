import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';
import { loadDictionary, isValidWord } from '../server/dictionary.js';

const URL = process.env.URL || 'http://127.0.0.1:3010';
const OUT = process.env.SHOT || path.resolve('screenshots-local/v0.2-word-hint-390x664.png');
const VIEWPORT = { width: 390, height: 664 };

loadDictionary();

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      if (res?.error) reject(new Error(`${event}: ${res.error}`));
      else resolve(res);
    });
  });
}

function findPlayable(letters) {
  const chars = letters.map((c) => String(c).toUpperCase());
  let best = '';
  const used = Array(chars.length).fill(false);
  function rec(cur) {
    if (cur.length >= 2 && isValidWord(cur) && cur.length > best.length) best = cur;
    if (cur.length >= 5 || (best.length >= 4 && cur.length >= 4)) return;
    for (let i = 0; i < chars.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      rec(cur + chars[i]);
      used[i] = false;
    }
  }
  rec('');
  return best;
}

async function connect(name) {
  const sock = io(URL, { transports: ['websocket'], reconnection: false, timeout: 20000 });
  sock.state = null;
  sock.on('state', (s) => { sock.state = s; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 20000);
    sock.once('connect', () => { clearTimeout(t); resolve(); });
    sock.once('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
  return sock;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="screen-home"]');
  await page.fill('[data-testid="name-input"]', 'Ada');
  await page.click('[data-testid="create"]');
  await page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  await page.waitForFunction(() => /^[A-Z]{4,}$/.test(document.querySelector('[data-testid="room-code"]')?.textContent || ''));
  const code = (await page.textContent('[data-testid="room-code"]')).trim();
  console.log('room', code);

  const bea = await connect('Bea');
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 8000 });
  await page.waitForFunction(() => {
    const s = window.__wordDuel?.getState?.();
    return s && s.status === 'playing' && s.current && !s.current.paused;
  }, { timeout: 15000 });

  let info = await page.evaluate(() => {
    const s = window.__wordDuel.getState();
    return { yours: s.current.yours, letters: s.current.letters };
  });
  if (!info.yours) {
    const word = findPlayable(info.letters) || (info.letters[0] + info.letters[1]);
    await emit(bea, 'submitWord', { word });
    await page.waitForFunction(() => {
      const s = window.__wordDuel?.getState?.();
      return s && s.status === 'playing' && s.current && s.current.yours && !s.current.paused;
    }, { timeout: 15000 });
    info = await page.evaluate(() => {
      const s = window.__wordDuel.getState();
      return { yours: s.current.yours, letters: s.current.letters };
    });
  }

  const word = findPlayable(info.letters);
  if (!word) throw new Error(`no playable word in ${info.letters.join('')}`);
  console.log('playing', word, 'from', info.letters.join(''));

  await page.evaluate((chosen) => {
    const buttons = [...document.querySelectorAll('#tile-tray .tile:not(.used)')];
    for (const ch of chosen) {
      const btn = buttons.find((b) => !b.dataset.picked && b.textContent.trim().startsWith(ch));
      if (!btn) throw new Error(`missing tile ${ch}`);
      btn.dataset.picked = '1';
      btn.click();
    }
  }, word);

  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="word-hint"]');
    return el && el.textContent.includes('✓ word!');
  }, { timeout: 5000 });

  // Keep reserved space visible and uncluttered for the shot
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT, fullPage: false });
  console.log('wrote', OUT);

  const hintBox = await page.locator('[data-testid="word-hint"]').boundingBox();
  const rackBox = await page.locator('[data-testid="word-rack"]').boundingBox();
  console.log('hint', hintBox, 'rack', rackBox);
  if (errors.length) console.warn('page errors', errors);
  bea.close();
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
