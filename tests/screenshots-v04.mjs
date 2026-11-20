import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || path.resolve('screenshots-v04');
const VIEWPORTS = [
  { name: '390x664', width: 390, height: 664 },
  { name: '360x640', width: 360, height: 640 },
  { name: '844x340', width: 844, height: 340 },
  { name: '740x360', width: 740, height: 360 },
  { name: '1280x800', width: 1280, height: 800 },
];
const STORY_VPS = VIEWPORTS.filter((v) => v.name === '390x664' || v.name === '360x640');

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

async function waitState(page, pred, label, ms = 15000) {
  await page.waitForFunction(pred, { timeout: ms }).catch((err) => {
    throw new Error(`${label}: ${err.message}`);
  });
}

async function main() {
  console.log('screenshots from', URL, '->', OUT);
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await openPage(browser, vp);
    await page.fill('[data-testid="name-input"]', 'Ada');
    await shot(page, `home-${vp.name}`);
    await page.click('[data-testid="mode-story"]');
    await page.waitForTimeout(80);
    await shot(page, `home-story-${vp.name}`);
    await page.click('[data-testid="menu-btn"]');
    await page.waitForSelector('[data-testid="menu-panel"]:not(.hidden)');
    await shot(page, `menu-${vp.name}`);
    if (errors.length) console.warn('home errors', vp.name, errors);
    await context.close();
  }

  const slang = await openPage(browser, VIEWPORTS[0]);
  await slang.page.click('[data-testid="menu-btn"]');
  await slang.page.click('[data-testid="open-slang"]');
  await slang.page.waitForSelector('[data-testid="screen-slang"]:not(.hidden)');
  await slang.page.waitForFunction(() => (document.querySelectorAll('[data-testid="slang-list"] li').length > 10));
  for (const vp of VIEWPORTS) {
    await slang.page.setViewportSize({ width: vp.width, height: vp.height });
    await slang.page.waitForTimeout(80);
    await shot(slang.page, `slang-${vp.name}`);
  }
  await slang.context.close();

  // Classic play with bonus tiles
  const classic = await openPage(browser, VIEWPORTS[0]);
  await classic.page.fill('[data-testid="name-input"]', 'Ada');
  await classic.page.click('[data-testid="create"]');
  await classic.page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  const classicCode = (await classic.page.textContent('[data-testid="room-code"]')).trim();
  const beaClassic = await connectBea();
  await emit(beaClassic, 'joinRoom', { name: 'Bea', code: classicCode });
  await classic.page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
  await classic.page.waitForTimeout(200);
  for (const vp of VIEWPORTS) {
    await classic.page.setViewportSize({ width: vp.width, height: vp.height });
    await classic.page.waitForTimeout(80);
    await shot(classic.page, `classic-turn-${vp.name}`);
  }
  beaClassic.close();
  await classic.context.close();

  // Story Duel flow
  const { context, page, errors } = await openPage(browser, VIEWPORTS[0]);
  await page.fill('[data-testid="name-input"]', 'Ada');
  await page.click('[data-testid="mode-story"]');
  await page.click('[data-testid="create"]');
  await page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  const code = (await page.textContent('[data-testid="room-code"]')).trim();
  console.log('story room', code);
  const bea = await connectBea();
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await page.waitForSelector('[data-testid="screen-fill"]:not(.hidden)', { timeout: 10000 });
  await waitState(page, () => window.__wordDuel?.getState()?.story?.blanks?.length === 5, 'blanks ready');

  const blankCount = await page.locator('#fill-fields input').count();
  for (let i = 0; i < blankCount; i++) {
    await page.fill(`[data-testid="fill-blank-${i}"]`, `silly thing ${i + 1}`);
  }
  await page.waitForTimeout(100);
  await page.evaluate(() => { const el = document.querySelector('[data-testid="fill-scroll"]'); if (el) el.scrollTop = 0; });
  for (const vp of STORY_VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(80);
    await shot(page, `story-fill-${vp.name}`);
  }

  const answers = await page.evaluate(() => window.__wordDuel.getState().story.blanks.map((b, i) => `Ada line ${i + 1}`));
  const beaAnswers = answers.map((_, i) => `Bea surprise ${i + 1}`);
  // refill visible fields to match what we submit
  for (let i = 0; i < answers.length; i++) {
    await page.fill(`[data-testid="fill-blank-${i}"]`, answers[i]);
  }
  await page.click('[data-testid="submit-story"]');
  await emit(bea, 'submitStory', { answers: beaAnswers });
  await page.waitForSelector('[data-testid="screen-reveal"]:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(200);
  for (const vp of STORY_VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(80);
    await shot(page, `story-reveal-${vp.name}`);
  }

  async function voteCurrent() {
    await page.waitForFunction(() => {
      const s = window.__wordDuel?.getState?.();
      return s?.status === 'revealing' && s.story?.subphase === 'vote';
    }, { timeout: 8000 });
    await page.click('[data-testid="vote-peach"]');
    await emit(bea, 'voteStory', { key: 'blossom' });
  }

  const lineCount = await page.evaluate(() => window.__wordDuel.getState().story.lineCount);
  for (let i = 0; i < lineCount; i++) {
    await voteCurrent();
    if (i === 0) {
      await page.waitForFunction(() => window.__wordDuel.getState().story.subphase === 'authors', { timeout: 8000 });
      await page.waitForTimeout(150);
      await shot(page, 'story-authors-390x664');
    }
  }

  await page.waitForSelector('[data-testid="screen-end"]:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(200);
  for (const vp of STORY_VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(80);
    await shot(page, `story-end-${vp.name}`);
  }

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
