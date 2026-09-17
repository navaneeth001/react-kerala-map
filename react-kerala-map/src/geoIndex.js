/**
 * Client-side point-in-division indexing for react-kerala-map.
 *
 * The published GeoJSON datasets are huge (ward boundaries alone are ~120MB)
 * and are loaded per-district, so classifying an arbitrary coordinate against
 * them has to be cheap. `createDivisionIndex` builds an exportable, reusable
 * bboxes-then-ray-casting index over any FeatureCollection and returns the
 * smallest matching feature for a point, plus a few helpers.
 *
 * This is a zero-dependency port of the ray-casting point-in-polygon logic;
 * it is intentionally pure (no Leaflet / DOM) so it can be unit-tested with
 * plain Node and reused by consumers that just need the classification.
 */

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Accumulate a `[minLng,minLat,maxLng,maxLat]` bbox over flat `[lng,lat]`
 * coordinates (a LineString / MultiPoint / flat ring of coords).
 */
function ringBbox(ring, bbox) {
  for (const coord of ring) {
    if (Array.isArray(coord)) {
      const [lng, lat] = coord.slice(0, 2);
      if (isFiniteNumber(lng) && isFiniteNumber(lat)) {
        if (bbox[0] === undefined || lng < bbox[0]) bbox[0] = lng;
        if (bbox[1] === undefined || lat < bbox[1]) bbox[1] = lat;
        if (bbox[2] === undefined || lng > bbox[2]) bbox[2] = lng;
        if (bbox[3] === undefined || lat > bbox[3]) bbox[3] = lat;
      }
    }
  }
  return bbox;
}

function polygonBbox(rings, bbox) {
  let acc = bbox || [undefined, undefined, undefined, undefined];
  for (const ring of rings) acc = ringBbox(ring, acc);
  return acc;
}

function multiPolygonBbox(polygons, bbox) {
  let acc = bbox || [undefined, undefined, undefined, undefined];
  for (const polygon of polygons) acc = polygonBbox(polygon, acc);
  return acc;
}

  function coordsBbox(coords, bbox) {
  for (const coord of coords) {
    if (Array.isArray(coord)) {
      const [lng, lat] = coord.slice(0, 2);
      if (isFiniteNumber(lng) && isFiniteNumber(lat)) {
        if (bbox[0] === undefined || lng < bbox[0]) bbox[0] = lng;
        if (bbox[1] === undefined || lat < bbox[1]) bbox[1] = lat;
        if (bbox[2] === undefined || lng > bbox[2]) bbox[2] = lng;
        if (bbox[3] === undefined || lat > bbox[3]) bbox[3] = lat;
      }
    }
  }
  return bbox;
}

/** Bounding box of any GeoJSON geometry, `[minLng,minLat,maxLng,maxLat]`. */
export function geometryBbox(geometry) {
  const coords = geometry && geometry.coordinates;
  if (!coords) return null;
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = coords.slice(0, 2);
      return [lng, lat, lng, lat];
    }
    case 'MultiPoint':
    case 'LineString':
      return coordsBbox(coords, [undefined, undefined, undefined, undefined]);
    case 'MultiLineString': {
      let bbox = [undefined, undefined, undefined, undefined];
      for (const ring of coords) bbox = coordsBbox(ring, bbox);
      return bbox;
    }
    case 'Polygon':
      return polygonBbox(coords);
    case 'MultiPolygon':
      return multiPolygonBbox(coords);
    case 'GeometryCollection': {
      let bbox = [undefined, undefined, undefined, undefined];
      for (const g of geometry.geometries) {
        const sub = geometryBbox(g);
        if (sub) {
          bbox = [
            bbox[0] === undefined ? sub[0] : Math.min(bbox[0], sub[0]),
            bbox[1] === undefined ? sub[1] : Math.min(bbox[1], sub[1]),
            bbox[2] === undefined ? sub[2] : Math.max(bbox[2], sub[2]),
            bbox[3] === undefined ? sub[3] : Math.max(bbox[3], sub[3]),
          ];
        }
      }
      return bbox;
    }
    default:
      return null;
  }
}

/**
 * Winding number of a point against a single ring of `[lng, lat]` coords.
 *
 * Winding number is used instead of an even-odd ray cast because it is robust
 * on shared polygon edges (points exactly on a boundary resolve to one side)
 * and, combined with the exterior/hole structure below, correctly excludes
 * points inside holes. The index returned by `createDivisionIndex` is the
 * primary export; `pointInGeometry` is exposed for consumers that already
 * have a geometry in hand.
 */
function winding(lng, lat, ring) {
  if (!ring || ring.length < 4) return false;
  let angle = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i].slice(0, 2);
    const [bx, by] = ring[i + 1].slice(0, 2);
    if (
      !isFiniteNumber(ax) ||
      !isFiniteNumber(ay) ||
      !isFiniteNumber(bx) ||
      !isFiniteNumber(by)
    ) {
      continue;
    }
    let delta = Math.atan2(by - lat, bx - lng) - Math.atan2(ay - lat, ax - lng);
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    angle += delta;
  }
  // Strict > so a point lying exactly on an edge (|angle| == Math.PI) is
  // treated as outside — this is what lets a shared-boundary point resolve to
  // the feature it is strictly inside rather than both neighbours.
  return Math.abs(angle) > Math.PI;
}

/**
 * Inside a Polygon (exterior ring) AND outside every hole ring. GeoJSON rings
 * are ordered [exterior, hole, hole, ...]; a point in a hole is inside the
 * exterior winding but the hole winding is non-zero, so we reject it.
 */
function pointInPolygon(lng, lat, polygon) {
  if (!polygon || !polygon.length) return false;
  if (!winding(lng, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (winding(lng, lat, polygon[h])) return false;
  }
  return true;
}

function pointInMultiPolygon(lng, lat, multi) {
  for (const polygon of multi) {
    if (pointInPolygon(lng, lat, polygon)) return true;
  }
  return false;
}

/** True when a coordinate lies inside a GeoJSON geometry (Polygon/MultiPolygon). */
export function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false;
  switch (geometry.type) {
    case 'Polygon':
      return pointInPolygon(lng, lat, geometry.coordinates);
    case 'MultiPolygon':
      return pointInMultiPolygon(lng, lat, geometry.coordinates);
    default:
      return false;
  }
}

function inBbox(lng, lat, bbox) {
  if (!bbox) return true; // no bbox -> defer to the full test
  return bbox[0] <= lng && bbox[2] >= lng && bbox[1] <= lat && bbox[3] >= lat;
}

/**
 * Build a classification index over a district's GeoJSON.
 *
 * @param {GeoJSON.FeatureCollection|GeoJSON.Feature[]} source
 * @param {{ codeProperty?: string }} [options]
 * @returns {{
 *   features: Array<{ feature: GeoJSON.Feature, bbox: [number,number,number,number] }>,
 *   findDivisionForPoint: (lng: number, lat: number) => GeoJSON.Feature | null,
 *   findDivisionForPointCode: (lng: number, lat: number) => string | null,
 *   findDivisionIndex: (lng: number, lat: number) => number,
 * }}
 */
export function createDivisionIndex(source, options = {}) {
  const codeProperty = options.codeProperty || 'sec_kerala_code';
  const rawFeatures =
    (Array.isArray(source) ? source : source && source.features) || [];

  const index = rawFeatures.map((feature) => {
    const bbox = geometryBbox(feature && feature.geometry);
    return {
      feature,
      bbox: bbox ? [bbox[0], bbox[1], bbox[2], bbox[3]] : undefined,
    };
  });

  function findDivisionIndex(lng, lat) {
    if (typeof lng !== 'number' || typeof lat !== 'number') return -1;
    for (let i = 0; i < index.length; i++) {
      const { feature, bbox } = index[i];
      if (!inBbox(lng, lat, bbox)) continue;
      if (pointInGeometry(lng, lat, feature.geometry)) return i;
    }
    return -1;
  }

  function findDivisionForPoint(lng, lat) {
    const i = findDivisionIndex(lng, lat);
    return i === -1 ? null : index[i].feature;
  }

  function findDivisionForPointCode(lng, lat) {
    const i = findDivisionIndex(lng, lat);
    if (i === -1) return null;
    const props = (index[i].feature && index[i].feature.properties) || {};
    return props[codeProperty] != null
      ? String(props[codeProperty])
      : props.name != null
        ? String(props.name)
        : null;
  }

  return {
    features: index,
    findDivisionForPoint,
    findDivisionForPointCode,
    findDivisionIndex,
  };
}


