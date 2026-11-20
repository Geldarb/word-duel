import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';
import { loadCommon, subwordsFor } from '../server/crossword.js';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || path.resolve('screenshots-v05');
const VIEWPORTS = [
  { name: '390x664', width: 390, height: 664 },
  { name: '360x640', width: 360, height: 640 },
  { name: '844x340', width: 844, height: 340 },
  { name: '740x360', width: 740, height: 360 },
  { name: '1280x800', width: 1280, height: 800 },
];
const REQUIRED = VIEWPORTS.filter((v) => v.name === '390x664' || v.name === '360x640');

fs.mkdirSync(OUT, { recursive: true });
loadCommon();

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

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function openPage(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width >= 1280 ? 1 : 2,
    isMobile: viewport.width < 800,
    hasTouch: viewport.width < 900,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="screen-home"]');
  return { context, page, errors };
}

function connectBea() {
  const bea = io(URL, { transports: ['websocket'], reconnection: false, timeout: 20000 });
  bea.state = null;
  bea.on('state', (s) => { bea.state = s; });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('bea connect timeout')), 25000);
    bea.once('connect', () => { clearTimeout(t); resolve(bea); });
    bea.once('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
}

async function main() {
  console.log('screenshots from', URL, '->', OUT);
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await openPage(browser, vp);
    await page.fill('[data-testid="name-input"]', 'Ada');
    await page.click('[data-testid="mode-race"]');
    await page.waitForTimeout(80);
    await shot(page, `home-race-${vp.name}`);
    if (errors.length) console.warn('home errors', vp.name, errors);
    await context.close();
  }

  const { context, page, errors } = await openPage(browser, VIEWPORTS[0]);
  await page.fill('[data-testid="name-input"]', 'Ada');
  await page.click('[data-testid="mode-race"]');
  await page.click('[data-testid="create"]');
  await page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  const code = (await page.textContent('[data-testid="room-code"]')).trim();
  const bea = await connectBea();
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await page.waitForSelector('[data-testid="screen-race"]:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__wordDuel?.getState?.());

  // Find one word as Bea so the partner bar is visible, then screenshot the race.
  const letters = bea.state.race.letters;
  const candidates = subwordsFor(letters);
  for (const word of candidates) {
    const res = await emit(bea, 'submitRaceWord', { word });
    if (res.result === 'found') break;
  }
  await page.waitForFunction(() => {
    const s = window.__wordDuel?.getState?.();
    return s?.race?.opponentCount >= 1;
  });
  await page.waitForTimeout(200);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(80);
    await shot(page, `race-${vp.name}`);
  }

  // Ada fills the rest from the page helper so the end screen is hers.
  const remaining = candidates;
  for (const word of remaining) {
    const ended = await page.evaluate(() => window.__wordDuel?.getState?.()?.status === 'ended');
    if (ended) break;
    await page.evaluate((w) => window.__wordDuel.submitRaceWord(w), word);
  }
  await page.waitForSelector('[data-testid="screen-end"]:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(200);

  for (const vp of REQUIRED) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(150);
    await shot(page, `race-end-${vp.name}`);
  }

  if (errors.length) console.warn('page errors', errors);
  bea.close();
  await context.close();
  await browser.close();
  console.log('screenshots done');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
