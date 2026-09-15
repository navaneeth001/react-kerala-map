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

// ------------------------------------------- initial top-level layer renders
// Regression: leaflet-search adds the whole searchable layer group to the map
// while the control is created, which makes Leaflet fire `baselayerchange` for
// those programmatic adds. If the controller treats them as user input, the
// cascade ends with no top-level layer on the map at all (blank map, no
// checked radio) until the consumer switches layers manually.
await page
  .waitForFunction(
    () => document.querySelectorAll('.leaflet-overlay-pane svg path').length > 5,
    { timeout: 60000 }
  )
  .catch(() => {});
const topLevel = await page.evaluate(() => ({
  paths: document.querySelectorAll('.leaflet-overlay-pane svg path').length,
  activeBaseLayers: document.querySelectorAll(
    '.leaflet-control-layers-base input:checked'
  ).length,
}));
check(
  'district layer renders without interaction',
  topLevel.paths > 5,
  `${topLevel.paths} paths`
);
check(
  'exactly one base layer is active on load',
  topLevel.activeBaseLayers === 1,
  `${topLevel.activeBaseLayers} checked`
);

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
check(
  'default popup stays free of electoral data',
  !/Election Results|Winning Party|Alliance|LDF|UDF|NDA/.test(popupText),
  popupText.slice(0, 100)
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

// ---------------------------------------- showElectionResults flag (opt-in)
// Contract of the opt-in flag: the built-in popups must stay party-free by
// default and only add the "Election Results" block when it is enabled. The
// demo exposes the popup builders, so both states can be asserted against real
// dataset shapes regardless of which polygon happens to receive a click.
const popupContract = await page.evaluate(() => {
  const builders = window.keralaMapPopups;
  const assembly = {
    Asmbly_Con: 'Manjeshwaram',
    District: 'KASARAGOD',
    elected_representative: 'AKM Ashraf',
    lac_code: 1,
    Prlmnt_Con: 'KASARAGOD',
    'Area(sqkm)': 378.6475933415851,
    winning_party: 'IUML',
    winning_party_full: 'Indian Union Muslim League',
    winning_front: 'UDF',
    winning_front_full: 'United Democratic Front',
  };
  const loksabha = {
    ls_seat_name: 'Mavelikkara',
    elected_representative: 'Kodikunnil Suresh',
    ls_seat_code: '16',
    ls_reservation: 'SC',
    electors: '1331880',
    votes: '894971',
    turnout_percentage: '67.20%',
    margin: '10868',
    margin_percentage: '1.20%',
    winning_party: 'INC',
    winning_party_full: 'Indian National Congress',
    winning_front: 'UDF',
    // The Lok Sabha dataset spells the full front name like this.
    fron_full: 'United Democratic Front',
  };
  const localBody = {
    sec_kerala_code: 'G01001',
    lsgd_name: 'Parassala',
    district: 'Thiruvananthapuram',
    lsgd_type: 'Grama Panchayat',
    number_of_wards: '24',
    LDF: '9',
    UDF: '10',
    NDA: '3',
    OTH: '2',
    majority_number: '13',
    largest_front: 'UDF',
    majority_front: 'No Majority',
  };
  const ward = {
    ward_name: 'KRISHNAPURAM',
    ward_number: 17,
    lsgd_name: 'Vellarada',
    lsgd_type: 'Grama Panchayat',
    elected_representative: 'Shinu M',
    winning_party: 'CPI(M)',
    winning_front: 'LDF',
    votes: '485',
    year: '2025',
  };

  return {
    off: {
      assembly: builders.assemblyPopupHtml(assembly),
      loksabha: builders.loksabhaPopupHtml(loksabha),
      localBody: builders.localBodyPopupHtml(localBody),
      ward: builders.wardPopupHtml(ward, null),
    },
    on: {
      assembly: builders.assemblyPopupHtml(assembly, { showElectionResults: true }),
      loksabha: builders.loksabhaPopupHtml(loksabha, { showElectionResults: true }),
      localBody: builders.localBodyPopupHtml(localBody, { showElectionResults: true }),
      ward: builders.wardPopupHtml(ward, null, { showElectionResults: true }),
    },
  };
});

const ELECTION_DATA =
  /Election Results|Winning Party|Alliance|\bLDF\b|\bUDF\b|\bNDA\b|IUML|CPI\(M\)/;
const leaked = Object.entries(popupContract.off).filter(([, html]) =>
  ELECTION_DATA.test(html)
);
check(
  'popup builders hide electoral data by default',
  leaked.length === 0,
  leaked.map(([type]) => type).join(', ') || 'all clean'
);

const missingBlock = Object.entries(popupContract.on).filter(
  ([, html]) => !html.includes('Election Results')
);
check(
  'popup builders add the election block when opted in',
  missingBlock.length === 0,
  missingBlock.map(([type]) => type).join(', ') || 'all four builders'
);
check(
  'opt-in assembly popup carries constituency + party data',
  popupContract.on.assembly.includes('Parliamentary Constituency') &&
    popupContract.on.assembly.includes('Indian Union Muslim League') &&
    popupContract.on.assembly.includes('United Democratic Front'),
  popupContract.on.assembly.slice(0, 60)
);
check(
  'opt-in loksabha popup reads the fron_full spelling',
  popupContract.on.loksabha.includes('Reservation') &&
    popupContract.on.loksabha.includes('Electors') &&
    popupContract.on.loksabha.includes('United Democratic Front'),
  popupContract.on.loksabha.slice(0, 60)
);
check(
  'opt-in local body popup carries the ward-wise front tally',
  popupContract.on.localBody.includes('No Majority') &&
    popupContract.on.localBody.includes('Majority (seats)'),
  popupContract.on.localBody.slice(0, 60)
);

// End to end: the flag must travel from the React prop into the popups the
// controller builds for a real click-driven selection.
await page.goto(`${PAGE_URL}&electionResults=1`, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.klm-sidebar', { timeout: 60000 });
await page.select('#klm-desktop-district', 'Ernakulam');
await page.waitForFunction(
  () => {
    const select = document.querySelector('#klm-desktop-type');
    return select && !select.disabled && Array.from(select.options).some((o) => o.value);
  },
  { timeout: 60000 }
);
await page.select('#klm-desktop-type', 'Grama Panchayat');
await page.waitForFunction(
  () => {
    const select = document.querySelector('#klm-desktop-body');
    return select && !select.disabled && select.options.length > 1;
  },
  { timeout: 30000 }
);
const optInBodies = await page.$$eval('#klm-desktop-body option', (options) =>
  options.filter((o) => o.value && !o.disabled).map((o) => o.value)
);
await page.select('#klm-desktop-body', optInBodies[0]);
await page.waitForSelector('.leaflet-popup', { timeout: 20000 });
const optInPopup = await page.$eval('.leaflet-popup', (node) =>
  node.textContent.replace(/\s+/g, ' ').trim()
);
check(
  'showElectionResults prop reaches the built-in popups',
  optInPopup.includes('Election Results'),
  optInPopup.slice(0, 120)
);
check(
  'opt-in popup renders the LDF / UDF tally for a grama panchayat',
  optInPopup.includes('LDF') && optInPopup.includes('UDF'),
  optInPopup.slice(0, 120)
);

// Back to the default (flag off) page: the mobile drawer section below reloads
// the current URL and is about the browse selects, not the flag.
await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });

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

