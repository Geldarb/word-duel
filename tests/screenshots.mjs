import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || path.resolve('screenshots');
const VIEWPORTS = [
  { name: '390x664', width: 390, height: 664 },
  { name: '360x640', width: 360, height: 640 },
  { name: '844x340', width: 844, height: 340 },
  { name: '740x360', width: 740, height: 360 },
  { name: '1280x800', width: 1280, height: 800 },
];

fs.mkdirSync(OUT, { recursive: true });

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

async function setViewportAndShot(page, screenName) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(80);
    await shot(page, `${screenName}-${vp.name}`);
  }
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
    await shot(page, `home-${vp.name}`);
    if (errors.length) console.warn('home errors', vp.name, errors);
    await context.close();
  }

  const { context, page, errors } = await openPage(browser, VIEWPORTS[0]);
  await page.fill('[data-testid="name-input"]', 'Ada');
  await page.click('[data-testid="create"]');
  await page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  await page.waitForFunction(() => /^[A-Z]{4,}$/.test(document.querySelector('[data-testid="room-code"]')?.textContent || ''));
  const code = (await page.textContent('[data-testid="room-code"]')).trim();
  console.log('room', code);
  await setViewportAndShot(page, 'lobby');

  const bea = await connectBea();
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await page.waitForSelector('[data-testid="screen-coin"]:not(.hidden), [data-testid="screen-play"]:not(.hidden)');
  if (await page.locator('[data-testid="screen-coin"]:not(.hidden)').count()) {
    await page.waitForTimeout(250);
    await setViewportAndShot(page, 'coin');
  }
  await page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(200);
  await setViewportAndShot(page, 'turn');

  async function submitCurrentTurn() {
    await page.waitForFunction(() => {
      const s = window.__wordDuel?.getState?.();
      return s && s.status === 'playing' && s.current && !s.current.paused;
    }, { timeout: 15000 });
    const info = await page.evaluate(() => {
      const s = window.__wordDuel.getState();
      return { yours: s.current.yours, word: s.current.letters[0] + s.current.letters[1] };
    });
    if (info.yours) {
      await page.evaluate((word) => window.__wordDuel.submit(word), info.word);
    } else {
      await emit(bea, 'submitWord', { word: info.word });
    }
  }

  await submitCurrentTurn();
  await page.waitForSelector('[data-testid="screen-result"]:not(.hidden)', { timeout: 8000 });
  await setViewportAndShot(page, 'result');

  for (let turn = 2; turn <= 12; turn++) {
    await page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 15000 });
    await submitCurrentTurn();
  }

  await page.waitForSelector('[data-testid="screen-end"]:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(200);
  await setViewportAndShot(page, 'end');

  await page.setViewportSize({ width: 390, height: 664 });
  await page.click('[data-testid="end-back"]');
  await page.waitForSelector('[data-testid="leave-modal"]:not(.hidden)');
  await shot(page, 'leave-modal-390x664');

  if (errors.length) console.warn('page errors', errors);
  bea.close();
  await context.close();
  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
