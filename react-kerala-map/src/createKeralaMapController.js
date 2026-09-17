/**
 * Framework-agnostic Leaflet controller powering react-kerala-map.
 *
 * This is a port of the original vanilla-JS Kerala Representative Map.
 * Political-party / alliance (LDF/UDF/NDA) visualisation is off by default:
 *   - no alliance colour coding (a single neutral `highlightColor` is used
 *     for selection highlighting instead)
 *   - popups expose only geography + representative details
 *
 * Setting the `showElectionResults` option to true opts back in to *showing*
 * the electoral data of the datasets inside the built-in popups. It never
 * switches on alliance colour coding.
 *
 * The controller owns the Leaflet map instance and exposes an imperative
 * API; the React component in KeralaMap.jsx is a thin wrapper around it.
 */

import L from 'leaflet';
import 'leaflet-search';
import {
  fetchDataBundle,
  loadDistrictLocalBodies,
  loadDistrictWards,
  DEFAULT_DATA_BASE_URL,
  DEFAULT_DATA_PATHS,
} from './dataApi.js';
import {
  loksabhaPopupHtml,
  assemblyPopupHtml,
  localBodyPopupHtml,
  wardPopupHtml,
} from './popups.js';
import { createDivisionIndex } from './geoIndex.js';

const NEUTRAL_FILL = '#f5f5f5';

const DEFAULT_OPTIONS = {
  dataBaseUrl: DEFAULT_DATA_BASE_URL,
  dataPaths: {},
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; OpenStreetMap contributors',
  /** Which top-level layers are available. */
  layers: ['districts', 'assembly', 'loksabha'],
  /** Which top-level layer is shown first. */
  initialLayer: 'districts',
  showLayerControl: true,
  showSearch: true,
  /** Colour used to highlight the currently selected feature. */
  highlightColor: '#1a73e8',
  /**
   * Opt-in flag (default `false`): the built-in popups additionally show the
   * electoral result data the datasets carry — winning party and alliance,
   * votes, margins, turnout, constituency codes, reservation and, for local
   * bodies, the ward-wise front tally. Leave it off to keep the map free of
   * party / alliance information.
   */
  showElectionResults: false,
  /** Optional (type, properties, localBodyInfo) => html|element|null. */
  popupRenderer: null,
  mapOptions: {},
  onSelectionChange: null,
  onReady: null,
  onError: null,
  /**
   * Called after a district's local-body GeoJSON has loaded, with the list of
   * `sec_kerala_code`s that actually have geometry. Consumers can use this to
   * avoid offering selections that cannot be drawn (e.g. block/district
   * panchayats have summary data but no published boundaries).
   */
  onLocalBodiesLoaded: null,
};

export function createKeralaMapController(container, userOptions = {}) {
  // Merge options while ignoring `undefined` values, so that consumers who
  // pass explicit `undefined` props (e.g. from React default destructuring)
  // don't clobber the defaults — Leaflet would otherwise receive
  // `tileUrl: undefined` and crash inside its URL templating.
  const options = { ...DEFAULT_OPTIONS };
  Object.keys(userOptions).forEach((key) => {
    if (userOptions[key] !== undefined) {
      options[key] = userOptions[key];
    }
  });

  // Normalize dataPaths so every path template is always defined —
  // user-provided paths override defaults key-by-key.
  options.dataPaths = {
    ...DEFAULT_DATA_PATHS,
    ...(options.dataPaths || {}),
  };

  let map = null;
  let districtLayer = null;
  let acLayer = null;
  let lsLayer = null;
  let localBodyLayer = null;
  let wardLayer = null;

  let selectedDistrict = null;
  let selectedAC = null;
  let selectedLS = null;
  let selectedLocalBody = null;
  let selectedWard = null;

  let searchableLayers = null;
  let searchControl = null;
  let lsgiLookup = {};
  let currentDistrict = null;
  let destroyed = false;

  /**
   * Leaflet's `LayersControl` fires `baselayerchange` for *every* add of a
   * registered base layer — not only for clicks in the control (see
   * `LayersControl._onLayerChange`). The listener further down cannot tell a
   * user click from the controller's own wiring, so this counter marks the
   * phases in which the controller adds/removes the top-level layers itself
   * and the listener ignores the events caused by it. Without it, adding a
   * layer re-enters the listener, and the resulting cascade ends with no
   * top-level layer on the map at all (blank map, no checked radio).
   */
  let programmaticLayerChange = 0;

  /** Run `fn` while `baselayerchange` events caused by it are ignored. */
  function withoutBaseLayerEvents(fn) {
    programmaticLayerChange += 1;
    try {
      return fn();
    } finally {
      programmaticLayerChange -= 1;
    }
  }

    const localBodyCache = new Map();
  const wardCache = new Map();
  /** district -> Set of sec_kerala_codes that have local-body geometry. */
  const localBodyCodesByDistrict = new Map();
  /** district -> division index built from the local-body GeoJSON. */
  const localBodyIndexCache = new Map();

  // ---------------------------------------------------------------
  // OPTIONS / STYLES
  // ---------------------------------------------------------------

  function updateOptions(partial = {}) {
    Object.keys(partial).forEach((key) => {
      if (partial[key] !== undefined) {
        options[key] = partial[key];
      }
    });
  }

  function neutralStyle(overrides = {}) {
    return {
      fillColor: NEUTRAL_FILL,
      weight: 1.2,
      opacity: 1,
      color: '#555',
      fillOpacity: 0.14,
      ...overrides,
    };
  }

  function selectedStyle(overrides = {}) {
    return {
      fillColor: options.highlightColor,
      color: '#000',
      weight: 2.5,
      fillOpacity: 0.35,
      ...overrides,
    };
  }
  function isHighlighted(layer) {
    return (
      layer === selectedDistrict ||
      layer === selectedAC ||
      layer === selectedLS ||
      layer === selectedLocalBody ||
      layer === selectedWard
    );
  }

  function highlightFeature(e) {
    const layer = e.target;
    if (isHighlighted(layer)) return;
    layer.setStyle(neutralStyle({ weight: 3, color: '#222', fillOpacity: 0.24 }));
    layer.bringToFront();
  }

  function findLayerByProperty(layerGroup, propertyName, value) {
    if (!layerGroup || !layerGroup.getLayers) return null;
    return (
      layerGroup.getLayers().find((layer) => {
        const props = ((layer.feature || {}).properties) || {};
        return String(props[propertyName] ?? '') === String(value);
      }) || null
    );
  }

  // ---------------------------------------------------------------
  // DRILL-DOWN STATE
  // ---------------------------------------------------------------

  function clearWardView() {
    if (wardLayer) {
      if (map && map.hasLayer(wardLayer)) map.removeLayer(wardLayer);
      wardLayer = null;
    }
    selectedWard = null;
  }

  function clearLocalBodyView() {
    clearWardView();
    if (localBodyLayer) {
      if (map && map.hasLayer(localBodyLayer)) map.removeLayer(localBodyLayer);
      if (searchableLayers) searchableLayers.removeLayer(localBodyLayer);
      localBodyLayer = null;
    }
    selectedLocalBody = null;
    currentDistrict = null;
  }

  /** Reset everything back to a plain top-level view. */
  function resetToTopLevel() {
    if (map) map.closePopup();
    clearLocalBodyView();
    if (selectedDistrict && districtLayer) districtLayer.resetStyle(selectedDistrict);
    selectedDistrict = null;
    if (selectedAC && acLayer) acLayer.resetStyle(selectedAC);
    selectedAC = null;
    if (selectedLS && lsLayer) lsLayer.resetStyle(selectedLS);
    selectedLS = null;
    emit('top', null, null, null, null);
  }

  /** Show exactly one top-level layer (districts / assembly / loksabha). */
  function activateTopLevelLayer(targetLayer) {
    if (!map) return;
    withoutBaseLayerEvents(() => {
      resetToTopLevel();
      [districtLayer, acLayer, lsLayer].forEach((layer) => {
        if (layer && layer !== targetLayer && map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
      if (targetLayer && !map.hasLayer(targetLayer)) {
        map.addLayer(targetLayer);
      }
    });
  }


  // ---------------------------------------------------------------
  // SELECTION EVENTS / POPUPS
  // ---------------------------------------------------------------

  function emit(level, district, secCode, properties, localBodyInfo) {
    if (destroyed || typeof options.onSelectionChange !== 'function') return;
    options.onSelectionChange({
      level,
      district: district ?? null,
      secCode: secCode ?? null,
      properties: properties ?? null,
      localBodyInfo: localBodyInfo ?? null,
    });
  }

  /**
   * Built-in popup HTML. `showElectionResults` is read on every call, so the
   * flag can be toggled at runtime through `updateOptions` and applies to the
   * popups opened afterwards.
   */
  function popupFor(type, properties, info) {
    if (typeof options.popupRenderer === 'function') {
      const custom = options.popupRenderer(type, properties || {}, info || null);
      if (custom !== undefined && custom !== null) return custom;
    }
    const popupOptions = { showElectionResults: options.showElectionResults };
    switch (type) {
      case 'loksabha':
        return loksabhaPopupHtml(properties || {}, popupOptions);
      case 'assembly':
        return assemblyPopupHtml(properties || {}, popupOptions);
      case 'localBody':
        return localBodyPopupHtml(info || {}, popupOptions);
      case 'ward':
        return wardPopupHtml(properties || {}, info, popupOptions);
      default:
        return '';
    }
  }

  // ---------------------------------------------------------------
  // LAYER BUILDERS
  // ---------------------------------------------------------------

  function buildConstituencyLayer(data, config) {
    return L.geoJSON(data, {
      style: () => neutralStyle(),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};

        feature.properties = {
          ...p,
          name: config.name(p),
          search_label: config.searchLabel(p),
          layer_type: config.layerType,
        };

        layer.bindTooltip(config.name(p), {
          sticky: true,
          direction: 'top',
          className: 'klm-tooltip',
        });

        layer.on({
          mouseover: highlightFeature,
          mouseout: (e) => {
            if (isHighlighted(e.target)) return;
            layer.resetStyle(e.target);
          },
          click: () => {
            // Clear previous selections on both constituency layers.
            if (selectedLS && selectedLS !== layer && lsLayer) {
              lsLayer.resetStyle(selectedLS);
            }
            if (selectedAC && selectedAC !== layer && acLayer) {
              acLayer.resetStyle(selectedAC);
            }
            if (config.layerType === 'loksabha') {
              selectedLS = layer;
              selectedAC = null;
            } else {
              selectedAC = layer;
              selectedLS = null;
            }

            layer.setStyle(selectedStyle());
            layer.bringToFront();

            layer.bindPopup(popupFor(config.layerType, p)).openPopup();

            emit(config.layerType, p.District || null, null, p, null);
          },
        });
      },
    });
  }

  function buildDistrictLayer(districtData) {
    districtLayer = L.geoJSON(districtData, {
      style: () => neutralStyle(),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};

        feature.properties = {
          ...p,
          name: p.district,
          search_label: `📍 ${p.district} District`,
          layer_type: 'district',
        };

        layer.bindTooltip(p.district, {
          sticky: true,
          direction: 'top',
          className: 'klm-tooltip',
        });

        layer.on({
          mouseover: highlightFeature,
          mouseout: (e) => {
            if (isHighlighted(e.target)) return;
            districtLayer.resetStyle(e.target);
          },
          click: async () => {
            await selectDistrict(layer, p.district);
          },
        });
      },
    });
    return districtLayer;
  }

  async function selectDistrict(layer, districtName) {
    if (selectedDistrict && selectedDistrict !== layer && districtLayer) {
      districtLayer.resetStyle(selectedDistrict);
    }
    selectedDistrict = layer;
    currentDistrict = districtName;

    layer.setStyle(selectedStyle({ weight: 3.2, fillOpacity: 0.28 }));
    if (map) {
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    }

    emit('district', districtName, null, (layer.feature || {}).properties || null, null);

    await loadLocalBodies(districtName);
  }

  // ---------------------------------------------------------------
  // LOCAL BODY (LSGI) LAYER
  // ---------------------------------------------------------------

  async function loadLocalBodies(district) {
    if (!map) return;
    clearLocalBodyView();
    currentDistrict = district;

    let geojson;
    try {
      geojson = localBodyCache.has(district)
        ? localBodyCache.get(district)
        : await loadDistrictLocalBodies(
            district,
            options.dataBaseUrl,
            options.dataPaths
          );
    } catch (error) {
      if (typeof options.onError === 'function') options.onError(error);
      return;
    }
    localBodyCache.set(district, geojson);

    // Build a client-side point-in-division index for coordinate lookups.
    if (!localBodyIndexCache.has(district)) {
      localBodyIndexCache.set(district, createDivisionIndex(geojson));
    }

    // Index the codes that actually have geometry for this district, so
    // consumers can tell which selections are drawable.
    const availableCodes = [];
    (geojson && geojson.features ? geojson.features : []).forEach((feature) => {
      const code = feature && feature.properties && feature.properties.sec_kerala_code;
      if (code !== undefined && code !== null && code !== '') {
        availableCodes.push(String(code));
      }
    });
    localBodyCodesByDistrict.set(district, new Set(availableCodes));

    if (typeof options.onLocalBodiesLoaded === 'function') {
      options.onLocalBodiesLoaded(district, availableCodes);
    }

    localBodyLayer = L.geoJSON(geojson, {
      style: () => neutralStyle(),
      onEachFeature: (feature, layer) => {
        const info = lsgiLookup[feature.properties.sec_kerala_code];

        if (info) {
          layer.bindTooltip(
            `<strong>${info.lsgd_name}</strong><br>${info.lsgd_type}`,
            { sticky: true, direction: 'top', className: 'klm-tooltip' }
          );
        }

        layer.on('click', async () => {
          await selectLocalBody(feature, layer, info);
        });
      },
    });

    map.addLayer(localBodyLayer);
    if (searchableLayers) searchableLayers.addLayer(localBodyLayer);
  }

  async function selectLocalBody(feature, layer, info) {
    if (!info) return;

    if (selectedLocalBody && selectedLocalBody !== layer) {
      selectedLocalBody.setStyle(neutralStyle());
    }
    selectedLocalBody = layer;

    layer.setStyle(selectedStyle({ weight: 2.7, fillOpacity: 0.28 }));

    if (map) {
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      layer.bindPopup(popupFor('localBody', feature.properties, info)).openPopup();
    }

    emit(
      'localBody',
      info.district,
      info.sec_kerala_code,
      feature.properties,
      info
    );

    await loadWardLayer(info.district, info.sec_kerala_code, info);
  }


  // ---------------------------------------------------------------
  // WARD LAYER
  // ---------------------------------------------------------------

  async function loadWardLayer(district, secKeralaCode, info) {
    if (!map) return;
    clearWardView();

        let geojson;
    try {
      geojson = wardCache.has(district)
        ? wardCache.get(district)
        : await loadDistrictWards(
            district,
            options.dataBaseUrl,
            options.dataPaths
          );
    } catch (error) {
      if (typeof options.onError === 'function') options.onError(error);
      return;
    }
    wardCache.set(district, geojson);

    wardLayer = L.geoJSON(geojson, {
      filter: (feature) =>
        feature.properties.sec_kerala_code === secKeralaCode,
      style: () => neutralStyle({ weight: 0.8 }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        layer.bindTooltip(
          `<strong>Ward ${p.ward_number}</strong><br>${p.ward_name}`,
          { sticky: true, direction: 'top', className: 'klm-tooltip' }
        );

        layer.on('click', () => {
          if (selectedWard && selectedWard !== layer && wardLayer) {
            wardLayer.resetStyle(selectedWard);
          }
          selectedWard = layer;

          layer.setStyle(selectedStyle({ weight: 1.4, fillOpacity: 0.3 }));
          layer.bringToFront();

          layer.bindPopup(popupFor('ward', p, info)).openPopup();

          emit('ward', district, p.sec_kerala_code, p, info);
        });
      },
    });

    wardLayer.addTo(map);

    // Fade the parent local body polygon into the background so wards stand out.
    if (selectedLocalBody) {
      selectedLocalBody.setStyle(neutralStyle({ weight: 1.3, fillOpacity: 0.14 }));
    }
    wardLayer.bringToFront();

    if (wardLayer.getBounds().isValid()) {
      map.fitBounds(wardLayer.getBounds(), { padding: [30, 30] });
    }
  }


  // ---------------------------------------------------------------
  // SEARCH / BROWSING HELPERS
  // ---------------------------------------------------------------

  function switchToLayer(name) {
    const layerMap = {
      districts: districtLayer,
      assembly: acLayer,
      loksabha: lsLayer,
    };
    const target = layerMap[name];
    if (!target || !map) return;

    activateTopLevelLayer(target);
    if (map.hasLayer(target) && target.getBounds) {
      map.fitBounds(target.getBounds());
    }
  }

  /**
   * Programmatic district selection by name.
   * Resolves to false when the district has no matching GeoJSON feature.
   */
  async function selectDistrictByName(districtName) {
    if (!districtLayer || !districtName || !map) return false;
    const match = findLayerByProperty(districtLayer, 'district', districtName);
    if (!match) return false;
    await selectDistrict(match, districtName);
    return true;
  }

  /**
   * Select a local body by its `sec_kerala_code`.
   * Resolves to false when the local body has no geometry in the district's
   * local-body GeoJSON (e.g. block/district panchayats have summary data but
   * no published boundaries), so callers can react instead of failing silently.
   */
  async function selectLocalBodyByCode(secCode) {
    if (!secCode || !map) return false;
    const info = lsgiLookup[secCode];
    if (!info) return false;

    if (!localBodyLayer || currentDistrict !== info.district) {
      await loadLocalBodies(info.district);
    }

    const match = findLayerByProperty(localBodyLayer, 'sec_kerala_code', secCode);
    if (!match) return false;

    await selectLocalBody(match.feature, match, info);
    return true;
  }

  /** Step back up the drill-down: ward -> local body -> district -> top. */
  function goBack() {
    if (!map) return;

    if (wardLayer) {
      const properties =
        ((selectedLocalBody || {}).feature || {}).properties || null;
      const info = properties
        ? lsgiLookup[properties.sec_kerala_code] || null
        : null;

      clearWardView();

      if (selectedLocalBody) {
        selectedLocalBody.setStyle(selectedStyle({ weight: 2.7, fillOpacity: 0.28 }));
        if (selectedLocalBody.getPopup()) selectedLocalBody.openPopup();
      }

      // Keep the reported selection in step with the map: closing the ward
      // view puts the drill-down back on the local body, so consumers don't
      // keep seeing `level: 'ward'` after going back.
      emit(
        'localBody',
        info ? info.district : currentDistrict,
        info ? info.sec_kerala_code : null,
        properties,
        info
      );
      return;
    }

    if (localBodyLayer) {
      const district = currentDistrict;
      clearLocalBodyView();
      if (selectedDistrict) {
        selectedDistrict.setStyle(selectedStyle({ weight: 3.2, fillOpacity: 0.28 }));
      }
      emit(
        'district',
        district,
        null,
        ((selectedDistrict || {}).feature || {}).properties || null,
        null
      );
      return;
    }

    resetToTopLevel();
  }

  function search(query) {
    if (!searchControl || !query) return;
    if (typeof searchControl.searchText === 'function') {
      searchControl.searchText(query);
    } else if (searchControl._input) {
      searchControl._input.value = query;
      if (typeof searchControl._search === 'function') searchControl._search();
    }
  }

  // ---------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------

  async function init() {
    try {
      map = L.map(container, { ...options.mapOptions });
      L.tileLayer(options.tileUrl, { attribution: options.tileAttribution }).addTo(map);

      const { districts, loksabha, assembly, lsgiLookup: lookup } =
        await fetchDataBundle(options);
      if (destroyed) return;
      lsgiLookup = lookup;

      buildDistrictLayer(districts);
      acLayer = buildConstituencyLayer(assembly, {
        layerType: 'assembly',
        name: (p) => p.Asmbly_Con,
        searchLabel: (p) => `🏛 ${p.Asmbly_Con} Assembly`,
      });
      lsLayer = buildConstituencyLayer(loksabha, {
        layerType: 'loksabha',
        name: (p) => p.ls_seat_name,
        searchLabel: (p) => `🟣 ${p.ls_seat_name} Lok Sabha`,
      });

      searchableLayers = L.layerGroup([districtLayer, acLayer, lsLayer]);

      const layerMap = {
        districts: districtLayer,
        assembly: acLayer,
        loksabha: lsLayer,
      };
      const initialKey = options.layers.includes(options.initialLayer)
        ? options.initialLayer
        : options.layers[0] || 'districts';
      const initialLayer = layerMap[initialKey] || districtLayer;

      activateTopLevelLayer(initialLayer);
      if (initialLayer.getBounds) map.fitBounds(initialLayer.getBounds());

      if (options.showLayerControl && options.layers.length > 1) {
        const baseMaps = {};
        if (options.layers.includes('districts')) baseMaps['Districts'] = districtLayer;
        if (options.layers.includes('assembly')) baseMaps['State Assembly'] = acLayer;
        if (options.layers.includes('loksabha')) baseMaps['Lok Sabha'] = lsLayer;

        if (Object.keys(baseMaps).length > 1) {
          L.control.layers(baseMaps, null, { collapsed: false }).addTo(map);
          map.on('baselayerchange', (event) => {
            // `baselayerchange` also fires for the adds the controller itself
            // performs (and for leaflet-search adding the searchable group
            // below), so only react to genuine clicks in the layer control.
            if (programmaticLayerChange > 0) return;
            if (
              event &&
              event.layer &&
              Object.values(baseMaps).includes(event.layer)
            ) {
              activateTopLevelLayer(event.layer);
            }
          });
        }
      }

      if (options.showSearch) {
        searchControl = new L.Control.Search({
          layer: searchableLayers,
          propertyName: 'search_label',
          initial: false,
          zoom: 10,
          marker: false,
          moveToLocation: (latlng) => map.setView(latlng, 10),
        });

        searchControl.on('search:locationfound', (e) => {
          const props = ((e.layer.feature || {}).properties) || {};
          const typeMap = {
            district: 'districts',
            assembly: 'assembly',
            loksabha: 'loksabha',
          };
          const layerKey = typeMap[props.layer_type];
          if (layerKey) activateTopLevelLayer(layerMap[layerKey]);

          if (e.layer.setStyle) {
            e.layer.setStyle({ weight: 4, color: '#000', fillOpacity: 0.6 });
          }
          if (e.layer.openPopup) e.layer.openPopup();
        });

        // leaflet-search adds the whole searchable layer group to the map when
        // the control is added (see `Control.Search#setLayer`), so Leaflet
        // announces a `baselayerchange` for every layer in it — ignore those
        // while keeping only the initial layer visible.
        withoutBaseLayerEvents(() => {
          map.addControl(searchControl);

          [districtLayer, acLayer, lsLayer].forEach((layer) => {
            if (layer !== initialLayer && map.hasLayer(layer)) {
              map.removeLayer(layer);
            }
          });
        });
      }

      if (typeof options.onReady === 'function') {
        options.onReady({ map, lookup: lsgiLookup, districts: getDistricts() });
      }
    } catch (error) {
      console.error('[react-kerala-map] init failed:', error);
      if (typeof options.onError === 'function') options.onError(error);
    }
  }

  function destroy() {
    destroyed = true;
    if (map) {
      map.remove();
      map = null;
    }
  }

  function getDistricts() {
    const names = new Set();
    Object.values(lsgiLookup).forEach((info) => {
      if (info && info.district) names.add(info.district);
    });
    return Array.from(names).sort();
  }

  function getLocalBodyTypes(district) {
    const types = new Set();
    Object.values(lsgiLookup).forEach((info) => {
      if (info && info.district === district && info.lsgd_type) {
        types.add(info.lsgd_type);
      }
    });
    return Array.from(types).sort();
  }

  /**
   * `sec_kerala_code`s that have local-body geometry for a district, or
   * `null` when that district's local-body GeoJSON has not been loaded yet.
   */
  function getAvailableLocalBodyCodes(district) {
    const codes = localBodyCodesByDistrict.get(district);
    return codes ? Array.from(codes) : null;
  }

    function getLocalBodies(district, type) {
    return Object.values(lsgiLookup)
      .filter(
        (info) =>
          info && info.district === district && (!type || info.lsgd_type === type)
      )
      .sort((a, b) => String(a.lsgd_name).localeCompare(String(b.lsgd_name)));
  }

  /**
   * Classify a geographic coordinate against the currently-loaded district's
   * local-body boundaries. Uses the client-side division index built by
   * `loadLocalBodies`; returns `null` when no district GeoJSON has been loaded
   * or the point falls outside every local body.
   *
   * @param {number} lng Longitude
   * @param {number} lat Latitude
   * @returns {string|null} The `sec_kerala_code` of the division, or `null`.
   */
  function findDivisionForPointCode(lng, lat) {
    const index = currentDistrict
      ? localBodyIndexCache.get(currentDistrict)
      : null;
    return index ? index.findDivisionForPointCode(lng, lat) : null;
  }

  /**
   * Feature matching a coordinate within the currently-loaded district, or
   * `null` when the district's GeoJSON has not been loaded yet or the point
   * does not lie inside any local body.
   *
   * @param {number} lng Longitude
   * @param {number} lat Latitude
   * @returns {GeoJSON.Feature|null}
   */
  function findDivisionForPoint(lng, lat) {
    const index = currentDistrict
      ? localBodyIndexCache.get(currentDistrict)
      : null;
    return index ? index.findDivisionForPoint(lng, lat) : null;
  }

  return {
    init,
    destroy,
    updateOptions,
    getMap: () => map,
    getLookup: () => lsgiLookup,
    getDistricts,
    getLocalBodyTypes,
    getLocalBodies,
    getAvailableLocalBodyCodes,
        switchToLayer,
    goBack,
    search,
    selectDistrictByName,
    selectLocalBodyByCode,
    findDivisionForPointCode,
    findDivisionForPoint,
  };
}

