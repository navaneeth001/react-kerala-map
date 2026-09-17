// Temporary unit check for createDivisionIndex — delete after run.
import { createDivisionIndex } from './src/geoIndex.js';
import { readFileSync } from 'node:fs';

const DATA = '/Users/navaneethprakash/Desktop/Work/Vruthi/Kerala_Representative_Map/data';
function load(rel) { return JSON.parse(readFileSync(`${DATA}/${rel}`, 'utf8')); }

// ---- independent brute-force via WINDING NUMBER (algorithmically distinct
// from the library's even-odd PNPOLY, so agreement is meaningful) ----
function winding(px, py, ring) {
  if (!ring || ring.length < 4) return false;
  let angle = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const a1 = Math.atan2(by - py, bx - px);
    const a2 = Math.atan2(ay - py, ax - px);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    angle += d;
  }
  return Math.abs(angle) > Math.PI; // non-zero winding -> inside the ring
}
// A point is inside a Polygon-with-holes iff it is inside the exterior ring
// AND not inside any hole ring. (Winding number alone doesn't imply holes.)
function geomHit(lng, lat, g) {
  if (!g) return false;
    const polyHit = (rings) => {
    if (!rings || !rings.length) return false;
    if (!winding(lng, lat, rings[0])) return false; // exterior
    for (let h = 1; h < rings.length; h++) {
      if (winding(lng, lat, rings[h])) return false; // in a hole
    }
    return true;
  };
  if (g.type === 'Polygon') return polyHit(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(polyHit);
  return false;
}
function bruteCode(geojson, lng, lat) {
  for (const f of geojson.features) {
    if (geomHit(lng, lat, f.geometry)) return String(f.properties.sec_kerala_code || f.properties.name || '');
  }
  return null;
}

// bbox center (compact local bodies => interior)
function bboxCenter(feature) {
  const bb = feature.bbox; // not present; compute from geom
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  const walk=(c)=>{ if(Array.isArray(c[0])){c.forEach(walk)} else {minx=Math.min(minx,c[0]);maxx=Math.max(maxx,c[0]);miny=Math.min(miny,c[1]);maxy=Math.max(maxy,c[1])} };
  walk(feature.geometry.coordinates);
  return [(minx+maxx)/2,(miny+maxy)/2];
}

let pass=0, fail=0;
function check(name, cond, extra){ if(cond){pass++} else {fail++; console.log('FAIL', name, extra)} }

// ---- Local bodies: bbox-center self-classify + independent brute-force agreement ----
const lb = load('kerala_lsgi/localbodies/ernakulam.geojson');
const idx = createDivisionIndex(lb);
check('index parses 96 features', idx.features.length === 96, idx.features.length);

let selfHits=0, bruteAgree=0, bruteDisagree=0;
for (const f of lb.features) {
  const c = bboxCenter(f);
  const got = idx.findDivisionForPointCode(c[0], c[1]);
  const want = String(f.properties.sec_kerala_code);
  if (got === want) selfHits++;
  const bf = bruteCode(lb, c[0], c[1]);
  if (got === bf) bruteAgree++; else bruteDisagree++;
}
check('local-body bbox centers self-classify (convex)', selfHits >= 88, selfHits);
check('index agrees with winding-force over bbox centers', bruteDisagree === 0, {agree: bruteAgree, disagree: bruteDisagree});

// ---- Grid scan over central Ernakulam (interior region): index must agree
// with the independent winding-number test at every cell. Proves the bbox
// prefilter drops nothing and the ray-cast is correct. ----
let gAgree=0, gMismatch=0, gTested=0, gHits=0;
for (let lat=9.9; lat<=10.22; lat+=0.008) {
  for (let lng=76.2; lng<=76.6; lng+=0.008) {
    const a = idx.findDivisionForPointCode(lng, lat);
    const b = bruteCode(lb, lng, lat);
    gTested++;
    if (a) gHits++;
    if (a === b) gAgree++; else { gMismatch++; if (gMismatch<=5) console.log('GRID MISMATCH', lng, lat, 'index=', a, 'winding=', b); }
  }
}
check('grid index==winding (interior region)', gMismatch === 0, {tested: gTested, hits: gHits, agree: gAgree, mismatch: gMismatch});

// ---- Maradu (M07031) — MultiPolygon, known interior + exterior points ----
const m = lb.features.find((f) => f.properties.sec_kerala_code === 'M07031');
const mc = bboxCenter(m);
check('Maradu bbox-center -> M07031', idx.findDivisionForPointCode(mc[0], mc[1]) === 'M07031', mc);
check('Maradu findDivisionIndex>=0', idx.findDivisionIndex(mc[0], mc[1]) >= 0);
check('Maradu winding-self agrees', bruteCode(lb, mc[0], mc[1]) === 'M07031');
check('ocean point -> null', idx.findDivisionForPointCode(76.0, 9.5) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

