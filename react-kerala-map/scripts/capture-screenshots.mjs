#!/usr/bin/env node
/**
 * Capture README screenshots of the demo app in headless Chrome.
 *
 *   npm install --no-save puppeteer-core
 *   npm run dev                      # in another terminal
 *   node scripts/capture-screenshots.mjs
 *
 * Saves PNGs (2x DPR) into docs/screenshots/ for the README gallery. Uses the
 * hosted data set from the original project by default; pass a data base URL
 * as the first argument to use a different host.
 *
 * Not part of the published package (`files` only includes dist, index.d.ts,
 * README.md and LICENSE).
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(HERE, '..', 'docs', 'screenshots');
const DATA = encodeURIComponent(
  process.argv[2] ||
    'https://gvnair.github.io/Kerala_Representative_Map/data/'
);
const PAGE_URL = `http://localhost:5174/?data=${DATA}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars'],
});

const events = [];

async function newPage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  page.on('console', async (message) => {
    const text = message.text();
    if (text.includes('[kerala-map] selection:')) {
      const value = await Promise.resolve(message.args()[1])
        .then((arg) => (arg ? arg.jsonValue() : null))
        .catch(() => null);
      if (value) events.push(value);
    }
  });
  return page;
}

async function goto(page, url = PAGE_URL) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.klm-sidebar', { timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.leaflet-overlay-pane svg path').length > 5,
    { timeout: 60000 }
  );
  await sleep(2500); // let basemap tiles settle
}

/** District -> type -> first body via the browse selects; waits for the popup. */
async function selectBodyAndReachPopup(page, prefix, type) {
  await page.select(`#klm-${prefix}-district`, 'Ernakulam');
  await page.waitForFunction(
    (p) => {
      const s = document.querySelector(`#klm-${p}-type`);
      return s && !s.disabled && Array.from(s.options).some((o) => o.value);
    },
    { timeout: 60000 },
    prefix
  );
  await page.select(`#klm-${prefix}-type`, type);
  await page.waitForFunction(
    (p) => {
      const s = document.querySelector(`#klm-${p}-body`);
      return s && !s.disabled && s.options.length > 1;
    },
    { timeout: 30000 },
    prefix
  );
  const bodies = await page.$$eval(`#klm-${prefix}-body option`, (options) =>
    options
      .filter((o) => o.value && !o.disabled)
      .map((o) => ({ value: o.value, label: o.textContent }))
  );
  await page.select(`#klm-${prefix}-body`, bodies[0].value);
  await page.waitForSelector('.leaflet-popup', { timeout: 20000 });
  await sleep(600);
  return bodies[0];
}

const shot = (page, name) =>
  page
    .screenshot({ path: join(OUT, `${name}.png`) })
    .then(() => console.log('saved', name));

// 1 — hero: default districts view
{
  const page = await newPage(1280, 800);
  await goto(page);
  await shot(page, 'hero');
  await page.close();
}

// 2 — local body popup with the opt-in election-results block
{
  const page = await newPage(1280, 800);
  await goto(page, `${PAGE_URL}&electionResults=1`);
  const body = await selectBodyAndReachPopup(page, 'desktop', 'Grama Panchayat');
  console.log('  body:', body.label);
  await shot(page, 'popup-local-body');
  await page.close();
}

// 3 — drill-down: ward selected by clicking the local body map
{
  const page = await newPage(1280, 800);
  await goto(page);
  await selectBodyAndReachPopup(page, 'desktop', 'Grama Panchayat');
  await page.evaluate(() => window.keralaMap.getMap().closePopup());
  await sleep(400);
  let wardReached = false;
  for (const [x, y] of [
    [640, 450], [700, 430], [580, 470], [660, 500], [720, 400], [620, 420],
  ]) {
    await page.mouse.click(x, y);
    await sleep(900);
    if (events[events.length - 1]?.level === 'ward') {
      wardReached = true;
      break;
    }
  }
  console.log('  ward reached:', wardReached);
  await sleep(1200); // ward popup + tiles
  await shot(page, 'drilldown-ward');
  await page.close();
}

// 4 — summary popup for a local body Kerala publishes no boundary for (0.4.0)
{
  const page = await newPage(1280, 800);
  await goto(page);
  const body = await selectBodyAndReachPopup(page, 'desktop', 'District Panchayat');
  console.log('  body:', body.label);
  await shot(page, 'summary-unmapped');
  await page.close();
}

// 5 — mobile browse drawer
{
  const page = await newPage(390, 844);
  await goto(page);
  await page.click('.klm-mobile-browse-button');
  await page.waitForSelector('#klm-mobile-district', { timeout: 15000 });
  await page.select('#klm-mobile-district', 'Kollam');
  await page.waitForFunction(
    () => {
      const s = document.querySelector('#klm-mobile-type');
      return s && !s.disabled && Array.from(s.options).some((o) => o.value);
    },
    { timeout: 60000 }
  );
  await sleep(1500);
  await shot(page, 'mobile-drawer');
  await page.close();
}

await browser.close();
console.log('done ->', OUT);
