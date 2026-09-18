import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/Users/navaneethprakash/Desktop/Work/Kerala_Representative_Map/react-kerala-map/docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5174';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-first-run', '--disable-extensions'],
});

async function ready(page) {
  await page.waitForFunction(
    () => window.keralaMap && window.keralaMap.getMap(),
    { timeout: 60000 },
  );
  // let tiles + panes settle
  await new Promise((r) => setTimeout(r, 2500));
}

async function settle(page, ms = 1200) {
  await new Promise((r) => setTimeout(r, ms));
}

const shots = [];
async function snap(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
  console.log('captured', file);
}

// ---- 1. Hero: default district view, desktop ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?electionResults=1`, { waitUntil: 'networkidle2' });
  await ready(page);
  await snap(page, 'hero');
  await page.close();
}

// ---- 2. District drill-down: Ernakulam local bodies ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await ready(page);
  const ok = await page.evaluate(() => window.keralaMap.selectDistrict('Ernakulam'));
  console.log('selectDistrict Ernakulam ->', ok);
  await settle(page, 2000);
  await snap(page, 'district-drilldown');
  await page.close();
}

// ---- 3. Local body popup with election results ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?electionResults=1`, { waitUntil: 'networkidle2' });
  await ready(page);
  const result = await page.evaluate(async () => {
    await window.keralaMap.selectDistrict('Ernakulam');
    const codes = window.keralaMap.getAvailableLocalBodyCodes('Ernakulam') || [];
    if (!codes.length) return { ok: false };
    const ok = await window.keralaMap.selectLocalBody(codes[0]);
    return { ok, code: codes[0], count: codes.length };
  });
  console.log('selectLocalBody ->', JSON.stringify(result));
  await settle(page, 1800);
  await snap(page, 'local-body-popup');
  await page.close();
}

// ---- 4. Assembly layer view ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await ready(page);
  await page.evaluate(() => window.keralaMap.switchToLayer('assembly'));
  await settle(page, 2000);
  await snap(page, 'assembly-layer');
  await page.close();
}

// ---- 5. Mobile view with district selected ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await ready(page);
  await page.evaluate(() => window.keralaMap.selectDistrict('Thiruvananthapuram'));
  await settle(page, 2000);
  await snap(page, 'mobile');
  await page.close();
}

await browser.close();
console.log('DONE', shots.length, 'screenshots');
