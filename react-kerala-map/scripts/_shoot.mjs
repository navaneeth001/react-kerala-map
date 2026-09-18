// Captures README screenshots of the demo app using headless Chrome.
// Run: node scripts/_shoot.mjs   (delete this file after use)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('npm', ['run', 'dev'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'pipe',
});
server.stdout.on('data', (d) => process.stdout.write('[vite] ' + d));
server.stderr.on('data', (d) => process.stderr.write('[vite!] ' + d));

async function waitUntil(fn, timeoutMs = 60000, every = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch {}
    await sleep(every);
  }
  throw new Error('waitUntil timed out');
}

const lookupUrl = 'https://gvnair.github.io/Kerala_Representative_Map/data/kerala_lsgi/kerala_lsgi_summary_2025_lookup.json';
const lookup = await (await fetch(lookupUrl)).json();
const entries = Object.entries(lookup);
const pick =
  entries.find(([k, v]) => /^[A-Z]\d{4,6}$/.test(k) && /grama/i.test(v.lsgd_type || '')) ||
  entries.find(([k, v]) => /^[A-Z]\d{4,6}$/.test(k) && v.lsgd_name);
const code = pick ? pick[0] : null;
console.log('using secKeralaCode:', code, JSON.stringify(pick && pick[1]).slice(0, 120));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});

async function newPage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  return page;
}

async function mapReady(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await waitUntil(async () =>
    page.evaluate(() => !!(window.keralaMap && document.querySelectorAll('path').length > 5))
  );
  await sleep(2500);
}

try {
  const p1 = await newPage(1440, 860);
  await mapReady(p1);
  await p1.screenshot({ path: OUT + 'hero.png' });
  console.log('OK hero.png');

  const sel = await p1.evaluate(async () => {
    const k = window.keralaMap;
    if (k.selectDistrictByName) return k.selectDistrictByName('Thiruvananthapuram');
    if (k.selectDistrict) return k.selectDistrict('Thiruvananthapuram');
    return false;
  });
  console.log('district selected:', sel);
  await sleep(2500);
  await p1.mouse.click(720, 430);
  await sleep(1200);
  await p1.screenshot({ path: OUT + 'drilldown.png' });
  console.log('OK drilldown.png');

  const ok = await p1.evaluate(async (c) => {
    const k = window.keralaMap;
    if (k.selectLocalBodyByCode) return k.selectLocalBodyByCode(c);
    if (k.selectLocalBody) return k.selectLocalBody(c);
    return false;
  }, code);
  console.log('local body selected:', ok);
  await sleep(2200);
  await p1.screenshot({ path: OUT + 'local-body.png' });
  console.log('OK local-body.png');

  const p2 = await newPage(1440, 860);
  await p2.goto(BASE + '/?electionResults=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await waitUntil(async () =>
    p2.evaluate(() => !!(window.keralaMap && document.querySelectorAll('path').length > 5))
  );
  await sleep(2000);
  await p2.evaluate(async (c) => {
    const k = window.keralaMap;
    if (k.selectLocalBodyByCode) await k.selectLocalBodyByCode(c);
    else if (k.selectLocalBody) await k.selectLocalBody(c);
  }, code);
  await sleep(2200);
  await p2.mouse.click(720, 430);
  await sleep(1000);
  await p2.screenshot({ path: OUT + 'election-results.png' });
  console.log('OK election-results.png');

  const p3 = await newPage(420, 880);
  await mapReady(p3);
  await p3.evaluate(() => {
    const btn = document.querySelector('.leaflet-control-container button, .sidebar-toggle, [class*="toggle"]');
    if (btn) btn.click();
  });
  await sleep(1200);
  await p3.screenshot({ path: OUT + 'mobile.png' });
  console.log('OK mobile.png');

  console.log('DONE');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
