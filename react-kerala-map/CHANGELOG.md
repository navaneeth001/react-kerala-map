# Changelog

### 0.5.1

- **Fixed:** README screenshot paths are now absolute (raw.githubusercontent.com)
  so images render on npmjs.com — relative `docs/` paths only work on GitHub.
- **Fixed:** `repository` / `homepage` / `bugs` metadata now points at
  `navaneeth001/react-kerala-map` (the previous `gvnair/Kerala_Representative_Map`
  links 404'd). No code changes — shipped to refresh the npm README.

### 0.5.0

- **New:** opt-in election results via the `showElectionResults` prop — popups
  can show party, alliance, votes and margins shipped with the datasets.
- **New:** client-side coordinate lookup — classify a lat/lng against
  local-body boundaries.



### 0.4.0

- **Fixed:** the browse sidebar no longer hides local-body types / bodies that
  have no published boundary. Block panchayats and district panchayats carry
  summary data (ward counts, ward-level results, front-wise tally) in the LSGI
  lookup but no ward polygons in the dataset, so they used to be listed
  **disabled** — which made e.g. *Thrissur → District Panchayat* and
  *Thrissur → Block Panchayat* unreachable while the original Kerala
  Representative Map lists every combination. Every district / type / body
  combination in the dataset is now listed and selectable again, with
  non-drawable entries still labelled `(no map data)`.
- **New:** selecting a local body with no published boundary keeps the district
  in view and opens its summary popup (name, type, district, total wards, and
  the electoral tally when `showElectionResults` is on), anchored at the
  district centre. `selectLocalBody` / `selectLocalBodyByCode` still resolve
  `false` for such codes so callers can tell a polygon selection from a summary
  one.
- **New:** `selectLocalBodySummary(secKeralaCode)` on the controller and the
  React ref — show any local body's details without needing boundary geometry.
- **New:** the browse sidebar explains the substitution inline
  ("*Paravur has no published boundary geometry — showing its summary instead.*")
  so the selection is never mistaken for a failure.
- **New:** `showSummaryForUnmappedBodies` prop / controller option
  (**default `true`**). Set it to `false` to make non-drawable selections a
  silent no-op, as before.
- **New:** `disableUnavailableLocalBodies` prop (**default `false`**) for
  consumers who prefer the previous behaviour of greying out every type / body
  that has no published boundary.
- `showDataAvailability` (and its existing `(no map data)` suffix) now only
  labels options instead of disabling them, and both the desktop sidebar and the
  mobile drawer track the same rules.
- **Fixed:** `joinUrl` is now actually exported from the package entry point —
  it was declared in the bundled type definitions but missing from the bundle
  at runtime.

### 0.3.0

- **New:** client-side coordinate lookup — `createDivisionIndex` builds a
  bounding-box-then-ray-casting point-in-polygon index over any GeoJSON
  FeatureCollection. Exposed on the controller as `findDivisionForPoint(lng, lat)`
  / `findDivisionForPointCode(lng, lat)` and on the React ref as
  `mapRef.current.findDivisionForPoint(...)` / `findDivisionForPointCode(...)`.
  Returns `null` when no district GeoJSON has been loaded or the point is outside
  every local body boundary.
- **New:** `loadDistrictLocalBodies(district, dataBaseUrl?, dataPaths?)` and
  `loadDistrictWards(district, dataBaseUrl?, dataPaths?)` helpers for fetching a
  district's local-body or ward GeoJSON with the shared in-memory cache.
- **New:** `geometryBbox(geometry)` and `pointInGeometry(lng, lat, geometry)`
  utility exports.
- The controller now builds a division index when a district's local-body
  GeoJSON loads (cached per district), powering the coordinate lookup methods.
- Cleaned up unused imports (`joinUrl`, `fetchJson`, `resolveDistrictPath`) in
  the controller — URL construction moved to the `dataApi` helpers.

### 0.2.0

- **New:** `showElectionResults` prop / controller option (**default `false`**)
  adds an **Election Results** block to the built-in popups with the electoral
  results and constituency data already carried by the datasets — see
  [Electoral results](#electoral-results-opt-in). Party / alliance **colouring**
  remains excluded either way.
- The exported popup builders (`loksabhaPopupHtml`, `assemblyPopupHtml`,
  `localBodyPopupHtml`, `wardPopupHtml`) accept an optional
  `{ showElectionResults }` argument, and the flag can be toggled after init
  with `controller.updateOptions({ showElectionResults })`.
- Lok Sabha popups read the dataset's `fron_full` spelling of the alliance name
  (the other files use `winning_front_full`); vote / elector counts are
  formatted with Indian digit grouping and percentages are not double-suffixed.
- Fixed: wiring the layers could cascade `baselayerchange` events and leave the
  map with no top-level layer drawn and no radio checked.
- Added package metadata (`repository`, `homepage`, `bugs`, `author`).

### 0.1.0

- First release: Leaflet map of Kerala with a District → Local Body → Ward
  drill-down, Districts / State Assembly / Lok Sabha layers, search, browse
  sidebar (desktop) and drawer (mobile), client-side caching and an imperative
  ref API.

## Author

Gokul Nair — [GitHub](https://github.com/gvnair)

## Credits

This package is a React packaging of the original
**[Kerala Representative Map](https://github.com/gvnair/Kerala_Representative_Map)**
project by [Gokul Nair](https://github.com/gvnair) — the interactive map that
inspired it, all of the cleaned GeoJSON / electoral datasets it fetches (hosted
by the original project on GitHub Pages), and the data-processing work behind
them are all theirs. Huge thanks to the original project; this package simply
makes that work reusable in React apps.

## License

[MIT](./LICENSE) © Gokul Nair
