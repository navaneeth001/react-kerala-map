import { geometryBbox } from './src/geoIndex.js';
import { readFileSync } from 'node:fs';
const D = '/Users/navaneethprakash/Desktop/Work/Vruthi/Kerala_Representative_Map/data';
function load(rel) { return JSON.parse(readFileSync(`${D}/${rel}`, 'utf8')); }

const lb = load('kerala_lsgi/localbodies/ernakulam.geojson');
const g = lb.features.find(f => f.properties.sec_kerala_code === 'G07039');
console.log('G07039 type:', g.geometry.type);
console.log('G07039 module bbox:', JSON.stringify(geometryBbox(g.geometry)));

// manual bbox
const c = g.geometry.coordinates;
let x0=1/0, x1=-1/0, y0=1/0, y1=-1/0;
const walk = (p) => {
  if (Array.isArray(p[0])) p.forEach(walk);
  else { x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); }
};
walk(c);
console.log('G07039 manual bbox:', [x0,y0,x1,y1]);
console.log('76,9.86 in manual bbox:', x0<=76 && x1>=76 && y0<=9.86 && y1>=9.86);

const districts = load('districts.geojson');
console.log('district feature keys:', Object.keys(districts.features[0].properties));
const ern = districts.features.find(f => Object.values(f.properties).some(v => String(v)==='Ernakulam'));
console.log('ernakulam props:', ern && ern.properties);
console.log('ernakulam bbox module:', ern && JSON.stringify(geometryBbox(ern.geometry)));
console.log('69,9.9 (fort kochi) in ern?', JSON.stringify(geometryBbox(ern.geometry)));
