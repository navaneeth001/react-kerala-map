// Developer utility: captures README screenshots of the example demo app.
// Usage:
//   1. Start the demo:  npx vite --config vite.config.example.mjs
//   2. Install the driver (once):  npm install --no-save puppeteer-core
//   3. Run:  node scripts/shoot-screenshots.mjs
// Screenshots are written to docs/screenshots/ at 2x device scale.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const DEMO_URL = process.env.DEMO_URL || 'http://localhost:5174/';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH and retry.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
});

async function newPage(w, h, query = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(DEMO_URL + query, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.keralaMap && window.keralaMap.getMap()', { timeout: 60000 });
  await sleep(3000); // let basemap tiles settle
  return page;
}

const shots = [
  {
    name: 'hero-map.png',
    run: async (page) => {
      await page.screenshot({ path: OUT_DIR + 'hero-map.png' });
    },
  },
  {
    name: 'district-detail.png',
    run: async (page) => {
      const ok = await page.evaluate(() => window.keralaMap.selectDistrict('Ernakulam'));
      await sleep(2500);
      await page.screenshot({ path: OUT_DIR + 'district-detail.png' });
      console.log('  selected:', ok);
    },
  },
  {
    name: 'local-body-detail.png',
    run: async (page) => {
      await page.evaluate(() => window.keralaMap.selectDistrict('Ernakulam'));
      await sleep(2500);
      const code = await page.evaluate(() => {
        const codes = window.keralaMap.getAvailableLocalBodyCodes('Ernakulam') || [];
        return codes[0] || null;
      });
      console.log('  local body code:', code);
      if (code) {
        await page.evaluate((c) => window.keralaMap.selectLocalBody(c), code);
        await sleep(2000);
      }
      await page.screenshot({ path: OUT_DIR + 'local-body-detail.png' });
    },
  },
  {
    name: 'assembly-elections.png',
    query: '?electionResults=1',
    run: async (page) => {
      await page.evaluate(() => window.keralaMap.switchToLayer('assembly'));
      await sleep(2000);
      const box = await page.evaluate(() => {
        const el = document.querySelector('.leaflet-container');
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(box.x, box.y);
      await sleep(2000);
      await page.screenshot({ path: OUT_DIR + 'assembly-elections.png' });
    },
  },
  {
    name: 'mobile-view.png',
    viewport: { width: 390, height: 844 },
    run: async (page) => {
      await page.screenshot({ path: OUT_DIR + 'mobile-view.png' });
    },
  },
];

for (const shot of shots) {
  const { width = 1440, height = 860 } = shot.viewport || {};
  try {
    const page = await newPage(width, height, shot.query || '');
    await shot.run(page);
    console.log('OK', shot.name);
    await page.close();
  } catch (e) {
    console.error('FAIL', shot.name + ':', e.message);
  }
}

await browser.close();
