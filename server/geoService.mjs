import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDivisionIndex } from '../react-kerala-map/src/geoIndex.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');

async function loadJson(rel) {
  return JSON.parse(await readFile(join(DATA, rel), 'utf8'));
}

const slug = (name) =>
  String(name).toLowerCase().replace(/\s+/g, '_');

export async function createGeoService() {
  const [districts, loksabha, assembly, lsgiLookup] = await Promise.all([
    loadJson('districts.geojson'),
    loadJson('kerala_loksabha/kerala_loksabha_mapped.geojson'),
    loadJson('kerala_stateassembly/kerala_stateassembly_2026_mapped.geojson'),
    loadJson('kerala_lsgi/kerala_lsgi_summary_2025_lookup.json'),
  ]);

  const districtIndex = createDivisionIndex(districts, { codeProperty: 'district' });
  const lokIndex = createDivisionIndex(loksabha, { codeProperty: 'unique_id' });
  const asmIndex = createDivisionIndex(assembly, { codeProperty: 'lac_code_unique_id' });

  // Lazy per-district local-body + ward indexes (51MB + 119MB total — never load all at once)
  const lbCache = new Map();
  const wardCache = new Map();

  async function localBodyIndex(district) {
    if (lbCache.has(district)) return lbCache.get(district);
    const fc = await loadJson(`kerala_lsgi/localbodies/${slug(district)}.geojson`);
    const idx = createDivisionIndex(fc, { codeProperty: 'sec_kerala_code' });
    lbCache.set(district, idx);
    return idx;
  }

  async function wardIndex(district) {
    if (wardCache.has(district)) return wardCache.get(district);
    const fc = await loadJson(`kerala_lsgi/wards/${slug(district)}.geojson`);
    const idx = createDivisionIndex(fc, { codeProperty: 'lsgd_unique_id' });
    wardCache.set(district, idx);
    return idx;
  }

  function shapeLocalBody(feature) {
    if (!feature) return null;
    const p = feature.properties || {};
    const summary = lsgiLookup[p.sec_kerala_code] || null;
    return {
      name: p.lsgd_name,
      type: p.lsgd_type, // Grama Panchayat | Municipality | Municipal Corporation | Corporation
      code: p.sec_kerala_code,
      district: p.district,
      summary: summary
        ? {
            total_wards: summary.number_of_wards,
            tally: {
              LDF: summary.LDF,
              UDF: summary.UDF,
              NDA: summary.NDA,
              OTH: summary.OTH,
            },
            largest_front: summary.largest_front,
            majority_front: summary.majority_front,
            majority_number: summary.majority_number,
          }
        : null,
    };
  }

  function shapeWard(feature) {
    if (!feature) return null;
    const p = feature.properties || {};
    return {
      number: p.ward_number,
      name: p.ward_name,
      code: p.lsgd_unique_id,
      local_body_code: p.sec_kerala_code,
      representative: p.elected_representative || null,
      winning_party: p.winning_party || null,
      winning_front: p.winning_front || null,
      votes: p.votes || null,
      election_year: p.year || null,
    };
  }

  async function lookup(lat, lng) {
    const districtFeature = districtIndex.findDivisionForPoint(lng, lat);
    if (!districtFeature) return null;
    const district = districtFeature.properties.district;

    const lbIdx = await localBodyIndex(district);
    const lbFeature = lbIdx.findDivisionForPoint(lng, lat);

    const lokFeature = lokIndex.findDivisionForPoint(lng, lat);
    const asmFeature = asmIndex.findDivisionForPoint(lng, lat);

    // Ward is the lowest administrative level — always resolved.
    const wIdx = await wardIndex(district);
    const wFeature = wIdx.findDivisionForPoint(lng, lat);

    const local_body = shapeLocalBody(lbFeature);
    const ward = shapeWard(wFeature);
    const assembly = asmFeature
      ? {
          name: asmFeature.properties.Asmbly_Con,
          code: asmFeature.properties.lac_code,
          district: asmFeature.properties.District,
          parliamentary_constituency: asmFeature.properties.Prlmnt_Con,
          mla: asmFeature.properties.elected_representative || null,
          winning_party: asmFeature.properties.winning_party || null,
          winning_party_full:
            asmFeature.properties.winning_party_full || null,
          winning_front: asmFeature.properties.winning_front || null,
          winning_front_full:
            asmFeature.properties.winning_front_full || null,
        }
      : null;
    const lok_sabha = lokFeature
      ? {
          name: lokFeature.properties.ls_seat_name,
          code: lokFeature.properties.ls_seat_code,
          reservation: lokFeature.properties.ls_reservation,
          mp: lokFeature.properties.elected_representative || null,
          winning_party: lokFeature.properties.winning_party || null,
          winning_party_full:
            lokFeature.properties.winning_party_full || null,
          winning_front: lokFeature.properties.winning_front || null,
          electors: lokFeature.properties.electors || null,
          votes_polled: lokFeature.properties.votes || null,
          turnout: lokFeature.properties.turnout_percentage || null,
          margin: lokFeature.properties.margin || null,
        }
      : null;

    // Human-readable breadcrumb: "MUKKOM WEST Ward 14, Mayyanad Grama Panchayat, Kollam"
    const civic_path = [
      ward
        ? `${ward.name} Ward ${ward.number}`
        : null,
      local_body
        ? `${local_body.name} ${local_body.type}`
        : null,
      district,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      query: { lat, lng },
      civic_path,
      district,
      local_body,
      ward,
      assembly,
      lok_sabha,
    };
  }

  return {
    lookup,
    districts: districtFeatureList(districts),
    cacheStats: () => ({
      localBodyDistrictsLoaded: [...lbCache.keys()],
      wardDistrictsLoaded: [...wardCache.keys()],
    }),
  };
}

function districtFeatureList(districts) {
  const seen = new Map();
  for (const f of districts.features || []) {
    const name = f?.properties?.district;
    if (name && !seen.has(name)) seen.set(name, name);
  }
  return [...seen.keys()].sort();
}
