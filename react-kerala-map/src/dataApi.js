/**
 * Data access layer for react-kerala-map.
 *
 * The GeoJSON datasets for Kerala are large (ward boundaries alone exceed
 * 100MB), so they are NOT bundled with the npm package. Instead the library
 * fetches them from a hosted `dataBaseUrl` (defaults to the Kerala
 * Representative Map project's GitHub Pages data directory) and caches
 * every response in-memory for the lifetime of the page.
 */

export const DEFAULT_DATA_BASE_URL =
  'https://gvnair.github.io/Kerala_Representative_Map/data';

/**
 * Paths (relative to dataBaseUrl) for every remote resource the map needs.
 * `{district}` is replaced with the slugified district name + ".geojson".
 */
export const DEFAULT_DATA_PATHS = {
  districts: 'districts.geojson',
  loksabha: 'kerala_loksabha/kerala_loksabha_mapped.geojson',
  assembly: 'kerala_stateassembly/kerala_stateassembly_2026_mapped.geojson',
  lsgiLookup: 'kerala_lsgi/kerala_lsgi_summary_2025_lookup.json',
  localBodies: 'kerala_lsgi/localbodies/{district}',
  wards: 'kerala_lsgi/wards/{district}',
};

/** "Thiruvananthapuram" -> "thiruvananthapuram.geojson" */
export function toDistrictFileName(district) {
  return String(district).toLowerCase().replace(/\s+/g, '_') + '.geojson';
}

/** Replace the {district} placeholder in a path template. */
export function resolveDistrictPath(template, district) {
  return String(template).replace('{district}', toDistrictFileName(district));
}

export function joinUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  return String(base).replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

const jsonCache = new Map();

/** Fetch + parse JSON with in-memory caching (keyed by URL). */
export async function fetchJson(url) {
  if (jsonCache.has(url)) {
    return jsonCache.get(url);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `react-kerala-map: failed to load ${url} (HTTP ${response.status})`
    );
  }

  const data = await response.json();
  jsonCache.set(url, data);
  return data;
}

/**
 * Load the four base resources the map needs on startup:
 * district boundaries, Lok Sabha constituencies, assembly constituencies
 * and the local-body (LSGI) summary lookup.
 */
export function fetchDataBundle({ dataBaseUrl = DEFAULT_DATA_BASE_URL, dataPaths } = {}) {
  const paths = { ...DEFAULT_DATA_PATHS, ...(dataPaths || {}) };

  return Promise.all([
    fetchJson(joinUrl(dataBaseUrl, paths.districts)),
    fetchJson(joinUrl(dataBaseUrl, paths.loksabha)),
    fetchJson(joinUrl(dataBaseUrl, paths.assembly)),
    fetchJson(joinUrl(dataBaseUrl, paths.lsgiLookup)),
  ]).then(([districts, loksabha, assembly, lsgiLookup]) => ({
    districts,
    loksabha,
    assembly,
    lsgiLookup: lsgiLookup || {},
  }));
}
