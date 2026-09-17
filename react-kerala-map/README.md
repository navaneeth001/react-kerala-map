# react-kerala-map

A React npm package version of the **Kerala Representatives Map** — an interactive
map of Kerala for exploring districts, local bodies (LSGIs), wards, and
Lok Sabha / State Assembly constituencies, with search and drill-down navigation.

> **Note:** The political party / alliance (LDF / UDF / NDA) *colouring* of the
> original project is intentionally **not** included: this package focuses on
> geography, boundaries and representative navigation, and selection
> highlighting uses a single configurable neutral colour.
>
> The electoral *data* the datasets already carry (winning party, alliance,
> votes, margins, ward tallies) ships with the map but is **off by default** —
> enable it with `showElectionResults`, see
> [Electoral results](#electoral-results-opt-in).

## Features

- Interactive Leaflet map of Kerala (OpenStreetMap tiles by default)
- Drill-down navigation: **District → Local Body → Ward**
- Top-level layers: **Districts**, **State Assembly**, **Lok Sabha** (toggle control)
- Search constituencies / districts with automatic layer switching
- Browse sidebar (desktop) and bottom drawer (mobile) with cascading
  District → Local Body Type → Local Body selects
- Un-drawable selections are surfaced honestly: local body types / bodies with
  no published boundaries are listed disabled with a `(no map data)` suffix
- Back button to step up the drill-down
- Hover tooltips and click popups showing representative details, party-free
  unless [`showElectionResults`](#electoral-results-opt-in) is enabled
- Client-side caching of fetched GeoJSON
- Imperative ref API for programmatic control
- Coordinate lookup: classify a lat/lng against local-body boundaries

## Installation

```bash
npm install react-kerala-map
```

Peer dependencies: `react` and `react-dom` (>= 17). `leaflet` and
`leaflet-search` are installed automatically as dependencies.

Import the component **and** its stylesheet:

```jsx
import KeralaMap from 'react-kerala-map';
import 'react-kerala-map/style.css';

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <KeralaMap />
    </div>
  );
}
```

That's it — by default the map fetches its GeoJSON data from the
[Kerala Representative Map project's hosted data](https://gvnair.github.io/Kerala_Representative_Map/data)
(GitHub Pages, CORS-enabled).

## Self-hosting the data

The GeoJSON datasets are large (ward boundaries alone are ~120 MB), so they are
not bundled in the package. To host them yourself, copy the `data/` folder of the
[original project](https://github.com/gvnair/Kerala_Representative_Map) to any
static host / CDN and point `dataBaseUrl` at it:

```jsx
<KeralaMap dataBaseUrl="https://cdn.example.com/kerala-map-data" />
```

Individual paths can also be overridden (paths are relative to `dataBaseUrl`;
the `{district}` placeholder is replaced with the slugified district name):

```jsx
<KeralaMap
  dataBaseUrl="https://cdn.example.com/kerala-map-data"
  dataPaths={{
    districts: 'geo/districts.geojson',
    loksabha: 'geo/loksabha.geojson',
    assembly: 'geo/assembly.geojson',
    lsgiLookup: 'data/lsgi_lookup.json',
    localBodies: 'geo/localbodies/{district}',
    wards: 'geo/wards/{district}',
  }}
/>
```

## Data coverage

The dataset ships ward-level polygons for **Grama Panchayats, Municipalities and
Municipal Corporations** only. **Block Panchayats** and the **District
Panchayat** exist in the LSGI summary lookup (ward counts, representative
details) but have **no published boundaries**, so they cannot be drawn or
selected on the map.

Rather than failing silently, the browse sidebar lists those types and bodies
**disabled**, labelled `(no map data)`. The controller exposes the same
information so custom UIs can do the same:

```jsx
mapRef.current.getAvailableLocalBodyCodes('Ernakulam');
// ['G07052', 'G07080', ...] — codes with geometry, or null while loading
```

`selectLocalBody(code)` / `selectLocalBodyByCode(code)` resolve to `false` for
codes without geometry (and `true` when the selection was applied), and the
`onLocalBodiesLoaded(district, codes)` controller callback fires once a
district's local-body GeoJSON has loaded.

The example app also accepts `?data=<base-url>` to point the demo at a different
data host:

```
http://localhost:5174/?data=http://localhost:8000/data/
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `dataBaseUrl` | `string` | hosted project data | Base URL for all data files |
| `dataPaths` | `object` | — | Override individual data file paths |
| `tileUrl` | `string` | OSM tiles | Tile layer URL template |
| `tileAttribution` | `string` | OSM attribution | Tile attribution string |
| `initialLayer` | `'districts' \| 'assembly' \| 'loksabha'` | `'districts'` | Layer shown on load |
| `layers` | `array` | all three | Which top-level layers are available |
| `showLayerControl` | `boolean` | `true` | Show the Leaflet layer switcher |
| `showSearch` | `boolean` | `true` | Show the search control |
| `showBrowseSidebar` | `boolean` | `true` | Show browse sidebar / mobile drawer |
| `showBackButton` | `boolean` | `true` | Show the drill-down back button |
| `highlightColor` | `string` | `'#1a73e8'` | Selection highlight colour |
| `showElectionResults` | `boolean` | `false` | Opt-in: electoral results + constituency data in the built-in popups |
| `popupRenderer` | `function` | — | Custom popup content (see below) |
| `mapOptions` | `object` | — | Extra Leaflet `Map` options |
| `onSelectionChange` | `function` | — | Fired on every selection change |
| `onReady` | `function` | — | Fired when data has loaded |
| `onError` | `function` | — | Fired on data-load errors |
| `browseSidebarTitle` | `string` | `'Browse Kerala'` | Sidebar / drawer heading |
| `className`, `style` | — | — | Applied to the root container |

## Ref API

```jsx
const mapRef = useRef(null);

<KeralaMap ref={mapRef} />;

mapRef.current.getMap();                    // Leaflet Map instance
mapRef.current.switchToLayer('assembly');   // 'districts' | 'assembly' | 'loksabha'
mapRef.current.selectDistrict('Ernakulam'); // drill into a district
mapRef.current.selectLocalBody('G01007');   // SEC Kerala code -> Promise<boolean>
mapRef.current.getAvailableLocalBodyCodes('Ernakulam'); // codes with geometry
mapRef.current.goBack();                    // step up the drill-down
mapRef.current.search('Kochi');             // programmatic search
mapRef.current.findDivisionForPointCode(76.2, 10.0); // -> "G07051" or null
mapRef.current.findDivisionForPoint(76.2, 10.0);    // -> GeoJSON.Feature or null
```

`findDivisionForPointCode` / `findDivisionForPoint` classify a `[lng, lat]`
coordinate against the local-body boundaries of the **currently loaded
district** using a client-side point-in-polygon index. They return `null` when no
district has been loaded yet or the point falls outside every local body. This
is handy for identifying which local body a marker or user click landed in.

## Electoral results (opt-in)

By default the popups stay free of party / alliance information. Setting
`showElectionResults` adds an **Election Results** block to them, built from the
electoral data the project's datasets already contain:

```jsx
<KeralaMap showElectionResults />
```

| Level | Rows added |
| --- | --- |
| Lok Sabha | Seat code, reservation, electors, votes polled, margin %, winning party, alliance |
| State Assembly | Constituency code, parliamentary constituency, area (sq km), winning party, alliance |
| Local body | LDF / UDF / NDA / Others ward tally, largest front, majority front, majority (seats) |
| Ward | Winning party, alliance, votes |

Alliance names tolerate the dataset's own spelling: the Lok Sabha file ships the
full name as `fron_full` while the other files use `winning_front_full`, and both
are displayed as `UDF — United Democratic Front`.

The flag exists on the imperative controller too, and can be toggled after
init (it is read whenever a popup is produced):

```js
const controller = createKeralaMapController(container, {
  showElectionResults: true,
});

controller.updateOptions({ showElectionResults: false });
```

Alliance **colour coding** stays excluded either way — `highlightColor` remains
the only fill colour the map applies to a selection. To try the flag out in the
demo app, append `?electionResults=1`.

## Custom popups

Default popups show only geographic / representative details, plus the election
block when `showElectionResults` is on. Provide `popupRenderer` to fully
customise them — return `null` to fall back to the built-in popup for that type:

```jsx
<KeralaMap
  popupRenderer={(type, properties, localBodyInfo) => {
    if (type === 'ward') {
      return `<h4>${properties.ward_name}</h4><p>${localBodyInfo?.lsgd_name}</p>`;
    }
    return null; // use the default popup
  }}
/>
```

## Styling

All CSS classes are prefixed with `klm-` and the stylesheet is plain CSS, so
you can override any rule globally. The component fills its parent container —
give the parent an explicit height (or use `position: fixed/absolute`).

## Local development

```bash
npm install
npm run dev           # demo app on http://localhost:5174
npm run build         # library build -> dist/
```

The demo accepts `?data=<base-url>` to point at a different data host and
`?electionResults=1` to try the opt-in result popups, e.g.
`http://localhost:5174/?data=http://localhost:8000/data/&electionResults=1`.

End-to-end check of the full drill-down (district → type → local body → ward,
back button, layer switch, search) in a real headless Chrome:

```bash
npm install --no-save puppeteer-core   # headless-browser driver (not published)
npm run dev                            # in another terminal
npm run test:e2e                       # add a data URL to test remote data
```

The script serves the repository's `data/` folder with CORS headers when it is
present, and falls back to the hosted data URL otherwise. It exits non-zero if
any check fails.

## Changelog

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

## License

MIT
