import { createDivisionIndex, pointInGeometry, geometryBbox } from './src/geoIndex.js';
import { readFileSync } from 'node:fs';
const D = '/Users/navaneethprakash/Desktop/Work/Vruthi/Kerala_Representative_Map/data';
function load(rel) { return JSON.parse(readFileSync(`${D}/${rel}`, 'utf8')); }

function winding(px, py, ring) {
  if (!ring || ring.length < 4) return false;
  let angle = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]; const [bx, by] = ring[i + 1];
    let d = Math.atan2(by - py, bx - px) - Math.atan2(ay - py, ax - px);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    angle += d;
  }
  return Math.abs(angle) > Math.PI;
}
function windingHit(lng, lat, g) {
  if (!g) return false;
  const polyHit = (rings) => {
    if (!rings || !rings.length) return false;
    if (!winding(lng, lat, rings[0])) return false;
    for (let h = 1; h < rings.length; h++) if (winding(lng, lat, rings[h])) return false;
    return true;
  };
  if (g.type === 'Polygon') return polyHit(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(polyHit);
  return false;
}

const lb = load('kerala_lsgi/localbodies/ernakulam.geojson');
const idx = createDivisionIndex(lb);
const f = lb.features.find((x) => x.properties.sec_kerala_code === 'M07066');
console.log('M07066 geom type:', f.geometry.type);
console.log('M07066 module bbox:', JSON.stringify(geometryBbox(f.geometry)));
console.log('M07066 module PIN(76.48,9.9):', pointInGeometry(76.48, 9.9, f.geometry));
console.log('M07066 winding(76.48,9.9):', windingHit(76.48, 9.9, f.geometry));
// count rings
let nrings = 0;
const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
for (const p of polys) nrings += p.length;
console.log('M07066 n_polygons:', polys.length, 'total_rings:', nrings, 'holes:', nrings - polys.length);
// show each ring's bbox
for (const p of polys) {
  for (const r of p) {
    let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0; for (const [x,y] of r){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
    console.log('  ring bbox', [x0,y0,x1,y1], 'len', r.length, 'closed', JSON.stringify(r[0])===JSON.stringify(r[r.length-1]));
  }
}
