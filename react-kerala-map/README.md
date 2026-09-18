# react-kerala-map

<p align="center">
  <img src="https://raw.githubusercontent.com/navaneeth001/react-kerala-map/main/react-kerala-map/docs/screenshots/hero.jpg" alt="react-kerala-map — interactive map of Kerala" width="100%" />
</p>

An interactive React map of Kerala for exploring **districts → local bodies → wards**
and **Lok Sabha / State Assembly constituencies**, with search, drill-down
navigation and popups showing each representative's details.

> Party/alliance *colouring* of the original project is intentionally excluded —
> selection highlighting uses a single configurable colour. The electoral *data*
> (party, alliance, votes, margins) ships with the datasets and can be enabled
> with the `showElectionResults` prop.

## Features

- 🔍 Drill-down navigation: **District → Local Body → Ward**
- 🗳️ Top-level layers: **Districts**, **State Assembly**, **Lok Sabha**
- 🔎 Search constituencies/districts with automatic layer switching
- 📋 Browse sidebar (desktop) / bottom drawer (mobile)
- 🏛️ Popups with representative details (opt-in election results)
- 📍 Coordinate lookup — classify a lat/lng against local-body boundaries
- ⚡ Imperative ref API + standalone helper exports for full programmatic control
- 💾 Client-side caching of fetched GeoJSON

## Installation

```bash
npm install react-kerala-map
```

Peer dependencies: `react` / `react-dom` (>= 17). `leaflet` and `leaflet-search`
are installed automatically.

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

That's it — data is fetched by default from the [original project's hosted
datasets](https://gvnair.github.io/Kerala_Representative_Map/data)
(GitHub Pages, CORS-enabled).

## Screenshots

| Drill-down to a ward | Local body popup |
| --- | --- |
| <img src="https://raw.githubusercontent.com/navaneeth001/react-kerala-map/main/react-kerala-map/docs/screenshots/drilldown-ward.jpg" width="100%" /> | <img src="https://raw.githubusercontent.com/navaneeth001/react-kerala-map/main/react-kerala-map/docs/screenshots/popup-local-body.jpg" width="100%" /> |

| Summary popup (bodies with no boundaries) | Mobile drawer |
| --- | --- |
| <img src="https://raw.githubusercontent.com/navaneeth001/react-kerala-map/main/react-kerala-map/docs/screenshots/summary-unmapped.jpg" width="100%" /> | <img src="https://raw.githubusercontent.com/navaneeth001/react-kerala-map/main/react-kerala-map/docs/screenshots/mobile-drawer.jpg" width="100%" /> |

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `dataBaseUrl` | `string` | hosted data | Base URL of the GeoJSON datasets |
| `dataPaths` | `object` | — | Override individual dataset paths (`{district}` placeholder supported) |
| `highlightColor` | `string` | `#2f6f3e` | Selection highlight colour |
| `showElectionResults` | `boolean` | `false` | Add the "Election Results" block to popups |
| `showDataAvailability` | `boolean` | `true` | Label options without published boundaries `(no map data)` |
| `disableUnavailableLocalBodies` | `boolean` | `false` | Grey out and disable those options |
| `showSummaryForUnmappedBodies` | `boolean` | `true` | Show a summary popup when selecting them |
| `showBackButton` | `boolean` | `true` | Hide the drill-down back button |
| `popupRenderer` | `function` | — | `(type, properties, localBodyInfo) => string \| null` custom popup HTML; `null` falls back to the default |
| `onReady` | `function` | — | `({ lookup }) => void` once data is indexed |
| `onSelectionChange` | `function` | — | `(selection) => void` on every selection change |
| `onLocalBodiesLoaded` | `function` | — | `(district, codes) => void` when a district's local-body GeoJSON loads |
| `onError` | `function` | — | `(error) => void` for data/fetch failures |

## Ref API

The component exposes an imperative handle for programmatic control —
`selectDistrict`, `selectConstituency`, `selectLocalBody`, `selectWard`,
`selectLocalBodySummary`, `getMap`, `getLookup`, `getDistricts`,
`getAvailableLocalBodyCodes` and more. Full signatures:
[`index.d.ts`](./index.d.ts).

```jsx
const mapRef = useRef(null);
<KeralaMap ref={mapRef} />;
mapRef.current?.selectDistrict('Ernakulam');
```

## Standalone exports

Everything is also exported as plain functions for use without the component:
popup builders (`loksabhaPopupHtml`, `assemblyPopupHtml`, `localBodyPopupHtml`,
`wardPopupHtml`), data loaders (`fetchDataBundle`, `loadDistrictLocalBodies`,
`loadDistrictWards`), `createKeralaMapController` (imperative, React-free),
`pointInGeometry`, `geometryBbox`, `createDivisionIndex`, `joinUrl` and
constants. See [`index.d.ts`](./index.d.ts) for the full list.

## Self-hosting the data

The datasets are large (ward boundaries alone are ~120 MB) and are not bundled.
Copy the `data/` folder of the
[original project](https://github.com/gvnair/Kerala_Representative_Map) to any
static host / CDN and point `dataBaseUrl` at it.

## Styling

All CSS classes are prefixed with `klm-` and the stylesheet is plain CSS, so any
rule can be overridden globally. The component fills its parent container — give
the parent an explicit height.

## Local development

```bash
npm install
npm run dev           # demo app on http://localhost:5174
npm run build         # library build -> dist/
npm run serve:data    # CORS-enabled static server for the repo's data/
npm run test:e2e      # headless-Chrome end-to-end check of the drill-down
```

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

[MIT](./LICENSE) © Gokul Nair

## Credits

This package is a React repackaging of the original
**[Kerala Representative Map](https://github.com/gvnair/Kerala_Representative_Map)**
by [Gokul Nair](https://github.com/gvnair) — all credit for the interactive map
concept, the cleaned GeoJSON/electoral datasets and the data-processing work
goes to the original project and its contributors. The hosted datasets this
package consumes by default are served from the original project's GitHub Pages.
