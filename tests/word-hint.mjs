import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, isValidWord } from '../server/dictionary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXTERNAL_URL = process.env.URL || process.env.LIVE_URL || '';
const PORT = 31200 + Math.floor(Math.random() * 500);
const SECRET = 'hint-ui-test';

loadDictionary();

function findValid(letters) {
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

async function startServer() {
  const child = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), TEST_SECRET: SECRET },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 15000);
    const onData = (buf) => {
      if (String(buf).includes('listening')) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.off('exit', onExit);
        resolve();
      }
    };
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}`));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (b) => process.stderr.write(b));
    child.once('exit', onExit);
  });
  return child;
}

async function makePage(browser, name, url) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 664 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="screen-home"]');
  await page.fill('[data-testid="name-input"]', name);
  return { context, page, name, errors };
}

async function tapLetters(page, word) {
  for (const ch of word.split('')) {
    const clicked = await page.evaluate((letter) => {
      const buttons = [...document.querySelectorAll('[data-testid="tile-tray"] button.tile:not(.used)')];
      const btn = buttons.find((b) => (b.dataset.letter || '').toUpperCase() === letter);
      if (!btn) return false;
      btn.click();
      return true;
    }, ch);
    if (!clicked) throw new Error(`could not click letter ${ch}`);
  }
}

async function waitYourTurn(page, ms = 12000) {
  await page.waitForFunction(() => {
    const s = window.__wordDuel?.getState?.();
    return s?.status === 'playing' && s.current?.yours && !s.current?.paused;
  }, null, { timeout: ms });
}

async function hintForTurn(player, label) {
  await waitYourTurn(player.page);
  const letters = await player.page.evaluate(() => window.__wordDuel.getState().current.letters);
  const word = findValid(letters);
  if (!word) throw new Error(`${label}: no valid word in ${letters.join('')}`);
  await player.page.click('[data-testid="clear"]').catch(() => {});
  await tapLetters(player.page, word);
  await player.page.waitForFunction((expected) => {
    const el = document.querySelector('[data-testid="word-hint"]');
    const text = el?.textContent || '';
    return text === '✓ word!' || text === '✓ slang!';
  }, word, { timeout: 4000 });
  const text = await player.page.locator('[data-testid="word-hint"]').textContent();
  if (text !== '✓ word!' && text !== '✓ slang!') {
    throw new Error(`${label}: expected hint, got ${JSON.stringify(text)} for ${word}`);
  }
  console.log(`  ${label}: ${word} -> ${text}`);
  return word;
}

async function main() {
  let server = null;
  const url = EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  if (!EXTERNAL_URL) server = await startServer();
  const browser = await chromium.launch();
  try {
    const ada = await makePage(browser, 'Ada', url);
    const bea = await makePage(browser, 'Bea', url);
    await ada.page.click('[data-testid="create"]');
    await ada.page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
    const code = (await ada.page.textContent('[data-testid="room-code"]')).trim();
    await bea.page.fill('[data-testid="code-input"]', code);
    await bea.page.click('[data-testid="join"]');
    await ada.page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
    await bea.page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
    await Promise.race([
      waitYourTurn(ada.page, 8000),
      waitYourTurn(bea.page, 8000),
    ]);

    const adaTurn = await ada.page.evaluate(() => !!window.__wordDuel.getState().current?.yours);
    const first = adaTurn ? ada : bea;
    const second = adaTurn ? bea : ada;
    console.log(`room ${code}, first ${first.name}`);

    await hintForTurn(first, `${first.name} first turn`);

    console.log(`  reloading ${first.name}`);
    await first.page.reload({ waitUntil: 'domcontentloaded' });
    await first.page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
    const word = await hintForTurn(first, `${first.name} after refresh`);
    await first.page.click('[data-testid="submit"]');

    await waitYourTurn(second.page, 10000);
    await hintForTurn(second, `${second.name} own turn`);
    console.log(`  reloading ${second.name}`);
    await second.page.reload({ waitUntil: 'domcontentloaded' });
    await second.page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
    await hintForTurn(second, `${second.name} after refresh`);

    if (ada.errors.length || bea.errors.length) {
      throw new Error(`page errors: ${[...ada.errors, ...bea.errors].join('; ')}`);
    }
    await ada.context.close();
    await bea.context.close();
    console.log('PASS word-hint ui (creator, joiner, resume)');
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
