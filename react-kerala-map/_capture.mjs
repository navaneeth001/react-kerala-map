import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const OUT = fileURLToPath(new URL('./docs/screenshots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

async function open(url, width = 1440, height = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction('window.keralaMap', { timeout: 90000 });
  await sleep(3500); // let tiles/geojson render
  return page;
}

// ---------- 1. Map overview (hero) ----------
let page = await open('http://localhost:5174/');
await shot(page, '01-map-overview');
console.log('shot 01');

// ---------- 2. Local body drill-down with wards ----------
await page.select('#klm-desktop-district', 'Ernakulam');
await sleep(1500);
const types = await page.$$eval('#klm-desktop-type option', (os) => os.map((o) => o.value));
console.log('types:', types);
const typeVal = types.find((t) => /municipality/i.test(t)) || types[1];
await page.select('#klm-desktop-type', typeVal);
await sleep(1500);
const bodies = await page.$$eval('#klm-desktop-body option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
console.log('bodies:', bodies.slice(0, 6));
const body = bodies.find((b) => b.v);
if (body) {
  await page.select('#klm-desktop-body', body.v);
  await sleep(1000);
  await page.evaluate((code) => window.keralaMap.selectLocalBody(code), body.v);
  await sleep(3500);
}
await shot(page, '02-local-body-drilldown');
console.log('shot 02');

// ---------- 3. Summary popup for an unmapped body (block panchayat) ----------
const blockTypes = types.find((t) => /block/i.test(t));
if (blockTypes) {
  await page.select('#klm-desktop-type', blockTypes);
  await sleep(1200);
  const bs = await page.$$eval('#klm-desktop-body option', (os) => os.map((o) => o.value).filter(Boolean));
  console.log('blocks:', bs.slice(0, 5));
  if (bs[0]) {
    await page.evaluate((code) => window.keralaMap.selectLocalBodySummary(code), bs[0]);
    await sleep(2500);
  }
}
await shot(page, '03-summary-popup');
console.log('shot 03');
await page.close();

// ---------- 4. Election results popup ----------
page = await open('http://localhost:5174/?electionResults=1');
await page.evaluate(() => {
  try { window.keralaMap.switchToLayer('assembly'); } catch (e) { console.log('switchToLayer fail', e.message); }
});
await sleep(2500);
// click on a populated area (central Kerala) to open a popup
const mapBox = await page.$('.leaflet-container');
const mb = await mapBox.boundingBox();
await page.mouse.click(mb.x + mb.width * 0.55, mb.y + mb.height * 0.5);
await sleep(2000);
const popupText = await page.evaluate(() => document.querySelector('.leaflet-popup')?.innerText?.slice(0, 200) || 'NO POPUP');
console.log('popup:', popupText.replace(/\n/g, ' | '));
await shot(page, '04-election-results');
console.log('shot 04');
await page.close();

// ---------- 5. Mobile view ----------
page = await open('http://localhost:5174/', 390, 844);
const hasToggle = await page.$('.klm-sidebar__toggle');
if (hasToggle) { await hasToggle.click(); await sleep(1200); }
await shot(page, '05-mobile');
console.log('shot 05');
await page.close();

await browser.close();
console.log('DONE');
