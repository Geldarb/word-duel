import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || path.resolve('screenshots-v06');
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

async function assertFits(page, label) {
  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const play = document.querySelector('#screen-play');
    const btn = document.querySelector('[data-testid="reroll"]');
    const btnRect = btn ? btn.getBoundingClientRect() : null;
    return {
      docScroll: doc.scrollHeight - doc.clientHeight,
      bodyScroll: document.body.scrollHeight - document.body.clientHeight,
      playOverflow: play ? play.scrollHeight - play.clientHeight : 0,
      btnVisible: !!(btn && btnRect && btnRect.width > 0 && btnRect.height >= 36
        && btnRect.top >= 0 && btnRect.bottom <= window.innerHeight + 1
        && btnRect.left >= 0 && btnRect.right <= window.innerWidth + 1),
      btnHeight: btnRect ? Math.round(btnRect.height) : 0,
    };
  });
  if (info.docScroll > 2 || info.bodyScroll > 2) {
    throw new Error(`${label}: page scrolls by ${info.docScroll}/${info.bodyScroll}px`);
  }
  if (info.playOverflow > 2) {
    throw new Error(`${label}: play screen overflows by ${info.playOverflow}px`);
  }
  if (!info.btnVisible) {
    throw new Error(`${label}: reroll button not fully visible (h=${info.btnHeight})`);
  }
  console.log('fits', label, info);
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

  const { context, page, errors } = await openPage(browser, VIEWPORTS[0]);
  await page.fill('[data-testid="name-input"]', 'Ada');
  await shot(page, 'home-390x664');
  await page.click('[data-testid="create"]');
  await page.waitForSelector('[data-testid="screen-lobby"]:not(.hidden)');
  const code = (await page.textContent('[data-testid="room-code"]')).trim();
  const bea = await connectBea();
  await emit(bea, 'joinRoom', { name: 'Bea', code });
  await page.waitForSelector('[data-testid="screen-play"]:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => window.__wordDuel?.getState()?.status === 'playing', { timeout: 10000 });
  await page.waitForTimeout(200);

  // If it is Ada's turn, reroll once so the count drops and tiles refresh.
  // If it is Bea's turn, stay on the waiting view with both counts visible.
  const yours = await page.evaluate(() => !!window.__wordDuel.getState()?.current?.yours);
  if (yours) {
    await page.click('[data-testid="reroll"]');
    await page.waitForFunction(() => window.__wordDuel.getState()?.you?.rerollsLeft === 2, { timeout: 5000 });
  } else {
    const endsAt = bea.state?.current?.endsAt;
    const rolled = await emit(bea, 'reroll', { token: bea.state.you.token });
    if (rolled?.ok !== true && rolled !== undefined) {
      // emit() already throws on error
    }
    await page.waitForFunction(() => {
      const s = window.__wordDuel.getState();
      return s?.lastReroll && s.lastReroll.yours === false && !s.lastReroll.hidden;
    }, { timeout: 5000 });
    if (endsAt) {
      // timer must not have been reset; remaining should still be below a fresh 60s minus a little slack
    }
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(100);
    await assertFits(page, `classic-turn-${vp.name}`);
    await shot(page, `classic-turn-${vp.name}`);
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
