import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npm', ['run', 'dev'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await sleep(3000);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
page.on('console', (m) => console.log('[console:' + m.type() + ']', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 100), r.failure()?.errorText));
try {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(30000);
  const state = await page.evaluate(() => ({
    keralaMap: !!window.keralaMap,
    paths: document.querySelectorAll('path').length,
    rootHtml: (document.getElementById('root')?.innerHTML || '').slice(0, 200),
    bodyText: document.body.innerText.slice(0, 200),
  }));
  console.log('STATE', JSON.stringify(state, null, 1));
} catch (e) { console.log('GOTO-ERR', String(e).slice(0, 300)); }
await browser.close();
server.kill('SIGTERM');
