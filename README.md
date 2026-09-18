# Kerala Election Map

An interactive political map of Kerala visualizing elected representatives across:

* Lok Sabha constituencies
* Kerala Legislative Assembly constituencies
* District boundaries

with searchable election and representative data.

---

## Live Demo

https://gvnair.github.io/Kerala_Representative_Map/

---

## Features

* Interactive political map of Kerala
* Lok Sabha and Assembly constituency layers
* District-level administrative view
* Search functionality with automatic layer switching
* Hover labels and election popups
* Alliance-based color visualization
* District overlays

---

## Why I Built This

The idea for this project came during the 2025 Kerala local body elections, when my grandmother was trying to figure out who represented our ward and who to vote for.

I realized that despite the importance of local democratic representation, there was no single centralized platform where users could easily explore elected representatives and political geography across Kerala.

This project aims to make that information more accessible and navigable.

---

## Data Processing

A significant part of the project involved:

* Cleaning and standardizing GeoJSON datasets
* Reconciling inconsistent constituency naming
* Processing election datasets from multiple sources
* Structuring geographic and election data for interactive visualization

---

## Technologies Used

* Leaflet.js
* GeoJSON
* JavaScript
* HTML/CSS
* OpenStreetMap
* GitHub Pages

---

## Local Body Election Data

Ward-level local body election data is currently being integrated.

The repository will also include:

* local body election CSV datasets
* ward-level representative information
* cleaned and standardized election data

to improve transparency and public access to local governance information in Kerala.

---

## Repository Structure

```plaintext
data/
├── loksabha_kerala_mapped.geojson
├── stateassembly_2026_mapped.geojson
├── district.geojson
├── local_body_results/
│   ├── corporation_results.csv
│   ├── municipality_results.csv
│   └── panchayat_results.csv
```

---

## React npm package

The map is also available as an npm package for React applications —
[`react-kerala-map`](./react-kerala-map#readme) — with District → Local Body →
Ward drill-down, search, a typed imperative ref / controller API and opt-in
election-result popups (alliance colouring is intentionally excluded):

```bash
npm install react-kerala-map
```

See the [package README](./react-kerala-map#readme) for props, the controller
API, self-hosting the data and the changelog.

---

## Future Improvements

* Ward-level map integration
* Historical election comparisons
* Party symbol support
* Mobile optimization
* Advanced search and filtering
* Election analytics dashboard

---

## Author

Gokul Nair

## License

Released under the [MIT license](./react-kerala-map/LICENSE) — © Gokul Nair,
original author of the
[Kerala Representative Map](https://github.com/gvnair/Kerala_Representative_Map).
