import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction('window.keralaMap', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const probe = await page.evaluate(() => {
  const km = window.keralaMap;
  const out = { methods: [], sidebarHtml: '', bodyClasses: document.body.className };
  for (const k of Object.keys(km ?? {})) {
    out.methods.push(`${k}: ${typeof km[k]}${typeof km[k] === 'function' ? `(${km[k].length} args)` : ''}`);
  }
  const panel = document.querySelector('.sidebar, [class*="sidebar"], [class*="panel"], [class*="browse"]');
  out.sidebarHtml = panel ? panel.outerHTML.slice(0, 4000) : 'NO PANEL FOUND';
  return out;
});
console.log('=== METHODS ===\n' + probe.methods.join('\n'));
console.log('=== SIDEBAR (first 4000) ===\n' + probe.sidebarHtml);
await browser.close();
