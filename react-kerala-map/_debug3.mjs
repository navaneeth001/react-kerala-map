import { createDivisionIndex, pointInGeometry } from './src/geoIndex.js';
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
for (const [lng, lat] of [[76.496, 10.06], [76.504, 10.06]]) {
  const a = idx.findDivisionForPointCode(lng, lat);
  const b = idx.findDivisionForPoint(lng, lat);
  const fa = lb.features.find((f) => f.properties.sec_kerala_code === a);
  console.log(`\npoint ${lng},${lat} -> index code=${a}`);
  for (const code of ['G07021', 'G07051']) {
    const f = lb.features.find((x) => x.properties.sec_kerala_code === code);
        const pin = pointInGeometry(lng, lat, f.geometry);
    const wn = windingHit(lng, lat, f.geometry);
    console.log(`  ${code}: PIN=${pin} winding=${wn}`);
  }
  // how many features claim the point under each algorithm
  let pinN = lb.features.filter((f) => pointInGeometry(lng, lat, f.geometry)).length;
  let wnN = lb.features.filter((f) => windingHit(lng, lat, f.geometry)).length;
  console.log(`  features claiming point: PIN=${pinN} winding=${wnN}`);
}
