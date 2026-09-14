#!/usr/bin/env node
/**
 * End-to-end browser test for react-kerala-map.
 *
 * Drives the demo app (npm run dev, default http://localhost:5174) in headless
 * Chrome and asserts the whole drill-down: district -> local body type ->
 * local body -> ward -> back, plus layer switching, search and the
 * "(no map data)" handling of local bodies without boundaries.
 *
 *   npm install --no-save puppeteer-core
 *   npm run dev                      # in another terminal
 *   node scripts/e2e-browser-test.mjs [dataBaseUrl]
 *
 * With no argument it serves the repository's ../data folder over HTTP with
 * CORS headers (which python -m http.server does not send, so the browser can
 * refuse it); pass a URL to test a hosted data set instead.
 *
 * Not part of the published package (`files` only includes dist, index.d.ts
 * and README.md).
 */
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'data');
const APP_URL = process.env.APP_URL || 'http://localhost:5174';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DATA_PORT = Number(process.env.DATA_PORT || 8766);
const MIME = {
  '.geojson': 'application/geo+json',
  '.json': 'application/json',
  '.csv': 'text/csv',
};

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch (error) {
  console.error('puppeteer-core is required: npm install --no-save puppeteer-core');
  process.exit(2);
}

/** Serve ../data with CORS headers so the browser can fetch it. */
async function startLocalDataServer() {
  try {
    await access(DATA_DIR);
  } catch (error) {
    return null;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = join(DATA_DIR, '..', normalize(decodeURIComponent(url.pathname)));
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (error) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      res.end('not found');
    }
  });

  await new Promise((resolve) => server.listen(DATA_PORT, resolve));
  return { server, base: `http://localhost:${DATA_PORT}/data/` };
}
const local = process.argv[2] ? null : await startLocalDataServer();
const DATA_BASE_URL = process.argv[2] || local.base;
const PAGE_URL = `${APP_URL}/?data=${encodeURIComponent(DATA_BASE_URL)}`;

const events = [];
const logs = [];
const errors = [];
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS  ' : 'FAIL  '}${name}${detail ? `  -> ${detail}` : ''}`);
};
const lastEvent = () => events[events.length - 1] || null;

console.log(`app:      ${PAGE_URL}`);
console.log(`data:     ${DATA_BASE_URL}\n`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('console', async (message) => {
  const text = message.text();
  logs.push(text);
  if (text.indexOf('[kerala-map] selection:') !== -1) {
    const value = await Promise.resolve(message.args()[1])
      .then((arg) => (arg ? arg.jsonValue() : null))
      .catch(() => null);
    if (value) events.push(value);
  }
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  // Tiles are third-party and abort freely while the map re-fits.
  if (/tile\.openstreetmap\.org|tile\.osm/.test(request.url())) return;
  errors.push(`requestfailed: ${request.url()} ${(request.failure() || {}).errorText}`);
});

await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
try {
  await page.waitForSelector('.klm-sidebar', { timeout: 60000 });
  check('map reaches ready state', true);
} catch (error) {
  const overlay = await page
    .$$eval('.klm-overlay', (nodes) => nodes.map((node) => node.textContent.trim()))
    .catch(() => []);
  console.log(`DIAG overlay: ${JSON.stringify(overlay)}`);
  console.log(`DIAG errors:\n${errors.slice(0, 6).join('\n')}`);
  await browser.close();
  local && local.server.close();
  check('map reaches ready state', false, 'see DIAG');
  process.exit(1);
}

// --------------------------------------------------------- district + options
// Delay the district's local-body file so the "still loading" state of the
// type select can be asserted deterministically.
const DISTRICT_FILE_DELAY = Number(process.env.E2E_DELAY_MS || 1500);
await page.setRequestInterception(true);
page.on('request', async (request) => {
  if (/localbodies\/ernakulam\.geojson/.test(request.url())) {
    await new Promise((resolve) => setTimeout(resolve, DISTRICT_FILE_DELAY));
  }
  request.continue().catch(() => {});
});

await page.select('#klm-desktop-district', 'Ernakulam');
await page.waitForFunction(
  () => document.querySelector('#klm-desktop-district').value === 'Ernakulam',
  { timeout: 30000 }
);
check('district selection sticks', true);

await page
  .waitForFunction(
    () => {
      const select = document.querySelector('#klm-desktop-type');
      return (
        select &&
        select.disabled &&
        select.options[0].textContent.includes('Loading local bodies')
      );
    },
    { timeout: 15000 }
  )
  .catch(() => {});
const loadingState = await page.$eval('#klm-desktop-type', (select) => ({
  disabled: select.disabled,
  placeholder: select.options[0].textContent,
}));
check(
  'type select waits while geometry loads',
  loadingState.disabled && loadingState.placeholder.includes('Loading local bodies'),
  JSON.stringify(loadingState)
);

await page
  .waitForFunction(
    () =>
      window.keralaMap &&
      Array.isArray(window.keralaMap.getAvailableLocalBodyCodes('Ernakulam')),
    { timeout: 60000 }
  )
  .catch(() => {});
const codes = await page.evaluate(() =>
  window.keralaMap.getAvailableLocalBodyCodes('Ernakulam')
);
check(
  'controller indexes local-body geometry (96 codes)',
  Array.isArray(codes) && codes.length === 96,
  Array.isArray(codes) ? `${codes.length} codes` : String(codes)
);

await page
  .waitForFunction(
    () => {
      const select = document.querySelector('#klm-desktop-type');
      return (
        select &&
        !select.disabled &&
        Array.from(select.options).some((o) => o.textContent.includes('(no map data)'))
      );
    },
    { timeout: 60000 }
  )
  .catch(() => {});

const typePlaceholder = await page.$eval('#klm-desktop-type option', (o) => o.textContent);
check(
  'type select resolves from loading to ready',
  typePlaceholder === 'Choose a type',
  typePlaceholder
);

const typeOptions = await page.$$eval('#klm-desktop-type option', (options) =>
  options.map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }))
);
const usableTypes = typeOptions.filter((o) => o.value && !o.disabled).map((o) => o.value);
const deadTypes = typeOptions.filter((o) => o.value && o.disabled).map((o) => o.value);
check(
  'mappable types offered in hierarchical order',
  usableTypes.join(',') === 'Grama Panchayat,Municipality,Municipal Corporation',
  usableTypes.join(' / ')
);
check(
  'block + district panchayats disabled & labelled',
  deadTypes.join(',') === 'District Panchayat,Block Panchayat' &&
    typeOptions.filter((o) => o.disabled).every((o) => o.label.includes('(no map data)')),
  `disabled=${deadTypes.join(' / ')}`
);

// ----------------------------------------------------------------------- type
await page.select('#klm-desktop-type', 'Grama Panchayat');
await page.waitForFunction(
  () => {
    const select = document.querySelector('#klm-desktop-body');
    return select && !select.disabled && select.options.length > 1;
  },
  { timeout: 30000 }
);
const bodyOptions = await page.$$eval('#klm-desktop-body option', (options) =>
  options.map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }))
);
const usableBodies = bodyOptions.filter((o) => o.value && !o.disabled);
check('all 82 grama panchayats selectable', usableBodies.length === 82, `${usableBodies.length} options`);
check('no dead grama panchayat options', bodyOptions.filter((o) => o.value && o.disabled).length === 0);


// --------------------------------------------------------- local body select
const target = usableBodies[0];
await page.select('#klm-desktop-body', target.value);
await new Promise((resolve) => setTimeout(resolve, 400));
const selected = await page.$eval('#klm-desktop-body', (s) => s.value);
check('local body selection sticks in dropdown', selected === target.value, selected || '(empty)');
check(
  'onSelectionChange emitted level=localBody',
  (lastEvent() || {}).level === 'localBody',
  JSON.stringify((lastEvent() || {}).level)
);

await page.waitForSelector('.leaflet-popup', { timeout: 20000 });
const popupText = await page.$eval('.leaflet-popup', (node) =>
  node.textContent.replace(/\s+/g, ' ').trim()
);
check('local body popup opens', popupText.length > 0, popupText.slice(0, 80));
check(
  'popup matches the chosen body',
  popupText.includes(target.label.split(' (')[0]),
  target.label
);

// ------------------------------------------------------ ward click drill-down
await page.evaluate(() => window.keralaMap.getMap().closePopup());
await new Promise((resolve) => setTimeout(resolve, 300));
let wardReached = false;
for (const [x, y] of [[640, 450], [700, 430], [580, 470], [660, 500], [720, 400]]) {
  await page.mouse.click(x, y);
  await new Promise((resolve) => setTimeout(resolve, 800));
  if ((lastEvent() || {}).level === 'ward') {
    wardReached = true;
    break;
  }
}
check('clicking the map drills into a ward', wardReached, JSON.stringify((lastEvent() || {}).level));
check('ward selection carries a secCode', wardReached && !!lastEvent().secCode, wardReached ? String(lastEvent().secCode) : 'n/a');
check(
  'ward polygons rendered',
  (await page.evaluate(() => document.querySelectorAll('.leaflet-interactive').length)) > 5
);

// --------------------------------------------------------------- back button
if (wardReached) {
  await page.click('.klm-back-button');
  await new Promise((resolve) => setTimeout(resolve, 700));
  check(
    'back button returns to the local body',
    (lastEvent() || {}).level === 'localBody',
    JSON.stringify((lastEvent() || {}).level)
  );
}

// -------------------------------------------------------------- layer switch
await page.evaluate(() => window.keralaMap.switchToLayer('assembly'));
await new Promise((resolve) => setTimeout(resolve, 2000));
check(
  'assembly layer switches on',
  (await page.evaluate(() => document.querySelectorAll('.leaflet-interactive').length)) > 0
);
await page.evaluate(() => window.keralaMap.switchToLayer('loksabha'));
await new Promise((resolve) => setTimeout(resolve, 2000));
check(
  'loksabha layer switches on',
  (await page.evaluate(() => document.querySelectorAll('.leaflet-interactive').length)) > 0
);

// -------------------------------------------------------------------- search
await page.evaluate(() => window.keralaMap.search('Kochi'));
await new Promise((resolve) => setTimeout(resolve, 1500));
check(
  'search control produces results',
  await page.evaluate(() => !!document.querySelector('.leaflet-control-search .search-tooltip'))
);

// ------------------------------------------------------- party-data hygiene
const partyFields = logs.filter((line) =>
  /LDF|UDF|NDA|largest_front|majority_front|winning_party/i.test(line)
);
check('no party/alliance data in app output', partyFields.length === 0, partyFields.slice(0, 1).join(''));
check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' || '));

// --------------------------------------------------------------- mobile UI
await page.setViewport({ width: 390, height: 844 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.klm-mobile-browse-button', { timeout: 60000 });
await page.click('.klm-mobile-browse-button');
await page.waitForSelector('#klm-mobile-district', { timeout: 15000 });
check('mobile drawer opens with browse selects', true);

await page.select('#klm-mobile-district', 'Kollam');
await page
  .waitForFunction(
    () => {
      const select = document.querySelector('#klm-mobile-type');
      return select && !select.disabled && Array.from(select.options).some((o) => o.value);
    },
    { timeout: 60000 }
  )
  .catch(() => {});
await page
  .waitForFunction(
    () => {
      const select = document.querySelector('#klm-mobile-type');
      return (
        select &&
        !select.disabled &&
        Array.from(select.options).some((o) => o.textContent.includes('(no map data)'))
      );
    },
    { timeout: 60000 }
  )
  .catch(() => {});

const mobileTypes = await page.$$eval('#klm-mobile-type option', (options) =>
  options
    .filter((o) => o.value && !o.disabled)
    .map((o) => o.value)
);
check(
  'mobile type list is geometry-filtered too (Kollam)',
  mobileTypes.join(',') === 'Grama Panchayat,Municipality,Municipal Corporation',
  mobileTypes.join(' / ')
);

await page.select('#klm-mobile-type', 'Municipality');
await page.waitForFunction(
  () => {
    const select = document.querySelector('#klm-mobile-body');
    return select && !select.disabled && select.options.length > 1;
  },
  { timeout: 30000 }
);
const mobileBodies = await page.$$eval('#klm-mobile-body option', (options) =>
  options.filter((o) => o.value && !o.disabled).map((o) => o.value)
);
await page.select('#klm-mobile-body', mobileBodies[0]);
await new Promise((resolve) => setTimeout(resolve, 800));
check(
  'mobile local body selection applies',
  (await page.$eval('#klm-mobile-body', (s) => s.value)) === mobileBodies[0] &&
    (lastEvent() || {}).level === 'localBody',
  'value=' + mobileBodies[0] + ' level=' + JSON.stringify((lastEvent() || {}).level)
);

await browser.close();
if (local) local.server.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : '')
);
process.exit(failed.length ? 1 : 0);

