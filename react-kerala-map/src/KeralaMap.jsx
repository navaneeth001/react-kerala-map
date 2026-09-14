import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createKeralaMapController } from './createKeralaMapController.js';
import { DEFAULT_DATA_BASE_URL } from './dataApi.js';

/**
 * Display order for local-body types, matching the original Kerala
 * Representative Map (hierarchical rather than alphabetical).
 */
const LOCAL_BODY_TYPE_ORDER = [
  'District Panchayat',
  'Block Panchayat',
  'Grama Panchayat',
  'Municipality',
  'Municipal Corporation',
];

function compareLocalBodyTypes(a, b) {
  const indexA = LOCAL_BODY_TYPE_ORDER.indexOf(a);
  const indexB = LOCAL_BODY_TYPE_ORDER.indexOf(b);

  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;

  return String(a).localeCompare(String(b));
}

/**
 * Cascading District -> Local Body Type -> Local Body selects.
 * Options that have no published geometry are shown disabled and labelled,
 * because selecting them cannot draw anything on the map.
 * Rendered inside the desktop sidebar and the mobile drawer.
 */
function BrowseControls({
  districts,
  typeOptions,
  bodyOptions,
  selection,
  bodyType,
  bodiesLoading,
  onDistrictChange,
  onBodyTypeChange,
  onBodyChange,
  idPrefix,
}) {
  return (
    <>
      <div className="klm-sidebar__section">
        <label htmlFor={`${idPrefix}-district`}>District</label>
        <select
          id={`${idPrefix}-district`}
          value={selection.district || ''}
          onChange={(event) => onDistrictChange(event.target.value)}
          disabled={districts.length === 0}
        >
          <option value="">Select district</option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
      </div>

      <div className="klm-sidebar__section">
        <label htmlFor={`${idPrefix}-type`}>Local Body Type</label>
        <select
          id={`${idPrefix}-type`}
          value={bodyType || ''}
          onChange={(event) => onBodyTypeChange(event.target.value)}
          disabled={!selection.district || bodiesLoading}
        >
          <option value="">
            {!selection.district
              ? 'Choose a district first'
              : bodiesLoading
                ? 'Loading local bodies…'
                : 'Choose a type'}
          </option>
          {typeOptions.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="klm-sidebar__section">
        <label htmlFor={`${idPrefix}-body`}>Local Body</label>
        <select
          id={`${idPrefix}-body`}
          value={selection.secCode || ''}
          onChange={(event) => onBodyChange(event.target.value)}
          disabled={!bodyType}
        >
          <option value="">{bodyType ? 'Choose a local body' : 'Choose a type first'}</option>
          {bodyOptions.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

const KeralaMap = forwardRef(function KeralaMap(props, ref) {
  const {
    dataBaseUrl = DEFAULT_DATA_BASE_URL,
    dataPaths,
    tileUrl,
    tileAttribution,
    initialLayer = 'districts',
    layers = ['districts', 'assembly', 'loksabha'],
    showLayerControl = true,
    showSearch = true,
    showBrowseSidebar = true,
    showBackButton = true,
    highlightColor = '#1a73e8',
    popupRenderer,
    mapOptions,
    onSelectionChange,
    onReady,
    onError,
    browseSidebarTitle = 'Browse Kerala',
    className = '',
    style,
  } = props;

  // All props the controller consumes at init-time; re-read without
  // re-creating the controller.
  const initPropsRef = useRef({
    dataBaseUrl,
    dataPaths,
    tileUrl,
    tileAttribution,
    initialLayer,
    layers,
    showLayerControl,
    showSearch,
    highlightColor,
    popupRenderer,
    mapOptions,
  });

  const callbacksRef = useRef({});
  callbacksRef.current = { onSelectionChange, onReady, onError };

  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const prevDistrictRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [selection, setSelection] = useState({
    level: 'top',
    district: null,
    secCode: null,
    properties: null,
    localBodyInfo: null,
  });
  const [bodyType, setBodyType] = useState('');
  // { district, codes: Set } of local bodies that actually have geometry for
  // the selected district; null until that district's GeoJSON has loaded.
  const [geometryIndex, setGeometryIndex] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const controller = createKeralaMapController(containerRef.current, {
      ...initPropsRef.current,
      onSelectionChange: (next) => {
        setSelection(next);
        if (typeof callbacksRef.current.onSelectionChange === 'function') {
          callbacksRef.current.onSelectionChange(next);
        }
      },
      onLocalBodiesLoaded: (district, codes) => {
        setGeometryIndex({ district, codes: new Set(codes) });
      },
      onReady: (payload) => {
        setLookup(payload.lookup);
        setStatus('ready');
        if (typeof callbacksRef.current.onReady === 'function') {
          callbacksRef.current.onReady(payload);
        }
      },
      onError: (err) => {
        setStatus('error');
        setError(err);
        if (typeof callbacksRef.current.onError === 'function') {
          callbacksRef.current.onError(err);
        }
      },
    });

    controllerRef.current = controller;
    controller.init();

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Live-update options the controller can consume without a re-init.
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.updateOptions({ highlightColor });
    }
  }, [highlightColor]);

  useImperativeHandle(
    ref,
    () => ({
      getMap: () => (controllerRef.current ? controllerRef.current.getMap() : null),
      switchToLayer: (name) =>
        controllerRef.current && controllerRef.current.switchToLayer(name),
      selectDistrict: (name) =>
        controllerRef.current && controllerRef.current.selectDistrictByName(name),
      selectLocalBody: (secCode) =>
        controllerRef.current && controllerRef.current.selectLocalBodyByCode(secCode),
      getAvailableLocalBodyCodes: (district) =>
        controllerRef.current
          ? controllerRef.current.getAvailableLocalBodyCodes(district)
          : null,
      goBack: () => controllerRef.current && controllerRef.current.goBack(),
      search: (query) => controllerRef.current && controllerRef.current.search(query),
    }),
    []
  );

  // Reset the local-body-type select whenever the district changes
  // (including when the district is changed by clicking the map); the
  // geometry index is repopulated once the district's data has loaded.
  useEffect(() => {
    if (prevDistrictRef.current !== selection.district) {
      prevDistrictRef.current = selection.district;
      setBodyType('');
      setGeometryIndex(null);
    }
  }, [selection.district]);

  const districtNames = useMemo(() => {
    if (!lookup) return [];
    return Array.from(
      new Set(
        Object.values(lookup)
          .map((info) => info.district)
          .filter(Boolean)
      )
    ).sort();
  }, [lookup]);

  // Codes with geometry for the current district, or null while unknown
  // (district not chosen yet, or its GeoJSON is still loading).
  const readyCodes =
    geometryIndex && geometryIndex.district === selection.district
      ? geometryIndex.codes
      : null;

  // While a district's local-body GeoJSON is still in flight we cannot know
  // which types are drawable, so the type select waits instead of offering
  // options that may have no geometry.
  const bodiesLoading = !!selection.district && readyCodes === null;

  const typeOptions = useMemo(() => {
    if (!lookup || !selection.district) return [];

    const entries = Object.values(lookup).filter(
      (info) => info && info.district === selection.district && info.lsgd_type
    );

    const types = Array.from(new Set(entries.map((info) => info.lsgd_type)));
    types.sort(compareLocalBodyTypes);

    return types.map((type) => {
      // A type is unusable when none of its local bodies has geometry
      // (Kerala publishes no block/district panchayat boundaries).
      const disabled =
        readyCodes !== null &&
        !entries.some(
          (info) =>
            info.lsgd_type === type &&
            readyCodes.has(String(info.sec_kerala_code))
        );

      return {
        value: type,
        label: disabled ? `${type} (no map data)` : type,
        disabled,
      };
    });
  }, [lookup, selection.district, readyCodes]);

  const bodyOptions = useMemo(() => {
    if (!lookup || !selection.district || !bodyType) return [];

    return Object.values(lookup)
      .filter(
        (info) =>
          info &&
          info.district === selection.district &&
          info.lsgd_type === bodyType
      )
      .sort((a, b) => String(a.lsgd_name).localeCompare(String(b.lsgd_name)))
      .map((info) => {
        const value = String(info.sec_kerala_code);
        const disabled = readyCodes !== null && !readyCodes.has(value);

        return {
          value,
          label: disabled
            ? `${info.lsgd_name} (no map data)`
            : String(info.lsgd_name),
          disabled,
        };
      });
  }, [lookup, selection.district, bodyType, readyCodes]);

  const handleDistrictChange = (districtName) => {
    setBodyType('');
    if (controllerRef.current && districtName) {
      controllerRef.current.selectDistrictByName(districtName);
    }
  };

  const handleBodyTypeChange = (nextType) => setBodyType(nextType);

  const handleBodyChange = (secCode) => {
    if (controllerRef.current && secCode) {
      controllerRef.current.selectLocalBodyByCode(secCode);
    }
  };

  const canGoBack = ['district', 'localBody', 'ward'].includes(selection.level);

  const browseControls = (idPrefix) => (
    <BrowseControls
      idPrefix={idPrefix}
      districts={districtNames}
      typeOptions={typeOptions}
      bodyOptions={bodyOptions}
      selection={selection}
      bodyType={bodyType}
      bodiesLoading={bodiesLoading}
      onDistrictChange={handleDistrictChange}
      onBodyTypeChange={handleBodyTypeChange}
      onBodyChange={handleBodyChange}
    />
  );

  return (
    <div className={`klm-root ${className}`} style={style}>
      <div ref={containerRef} className="klm-map" />

      {status === 'loading' && (
        <div className="klm-overlay">Loading Kerala map&hellip;</div>
      )}

      {status === 'error' && (
        <div className="klm-overlay klm-overlay--error">
          <strong>Failed to load map data.</strong>
          {error && error.message ? (
            <span className="klm-overlay__detail">{error.message}</span>
          ) : null}
        </div>
      )}

      {status === 'ready' && showBrowseSidebar && (
        <>
          <aside
            className={`klm-sidebar${
              sidebarCollapsed ? ' klm-sidebar--collapsed' : ''
            }`}
          >
            <button
              type="button"
              className="klm-sidebar__toggle"
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span>{browseSidebarTitle}</span>
              <span className="klm-sidebar__toggle-icon">
                {sidebarCollapsed ? '+' : '\u2212'}
              </span>
            </button>

            {!sidebarCollapsed && (
              <div className="klm-sidebar__body">
                {browseControls('klm-desktop')}
              </div>
            )}
          </aside>

          <button
            type="button"
            className="klm-mobile-browse-button"
            onClick={() => setMobileOpen(true)}
          >
            ☰ Browse
          </button>

          <div
            className={`klm-mobile-drawer${mobileOpen ? ' klm-mobile-drawer--open' : ''}`}
            aria-hidden={!mobileOpen}
          >
            <div className="klm-mobile-drawer__header">
              <span>{browseSidebarTitle}</span>
              <button
                type="button"
                className="klm-mobile-drawer__close"
                aria-label="Close browse panel"
                onClick={() => setMobileOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="klm-mobile-drawer__body">
              {browseControls('klm-mobile')}
            </div>
          </div>

          {mobileOpen && (
            <div
              className="klm-backdrop"
              onClick={() => setMobileOpen(false)}
            />
          )}
        </>
      )}

      {status === 'ready' && showBackButton && canGoBack && (
        <button
          type="button"
          className="klm-back-button"
          onClick={() =>
            controllerRef.current && controllerRef.current.goBack()
          }
        >
          ← Back
        </button>
      )}
    </div>
  );
});

export default KeralaMap;

