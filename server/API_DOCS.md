# Kerala Civic Lookup API — Integration Guide

Embed ward-level (lowest-administration) lookup in your core application.
One HTTP call: coordinates in → district → local body → **ward** (+ MLA/MP) out.

Base URL (after Render deploy):
`https://kerala-civic-lookup-api.onrender.com`
(Local dev: `http://localhost:3000`.)

---

## 1. The call you need (ward-level lookup)

```http
GET /lookup?lat={latitude}&lng={longitude}
```

| Param | Required | Notes |
|---|---|---|
| `lat` / `latitude` | yes | Decimal degrees, 7–13 for Kerala |
| `lng` (`lon`, `longitude` aliases) | yes | Decimal degrees, 74–78 for Kerala |

Example:

```bash
curl "https://kerala-civic-lookup-api.onrender.com/lookup?lat=8.822321&lng=76.648518"
```

POST alternative (same result, handy for batch clients):

```bash
curl -X POST "https://kerala-civic-lookup-api.onrender.com/lookup" \
  -H 'Content-Type: application/json' \
  -d '{"lat": 8.822321, "lng": 76.648518}'
```

---

## 2. Full response (annotated)

```jsonc
{
  "query": { "lat": 8.822321, "lng": 76.648518 },   // echo of your input
  "civic_path": "MUKKOM WEST Ward 14, Mayyanad Grama Panchayat, Kollam",
                                                    // breadcrumb: ward → local body → district
  "district": "Kollam",                             // revenue district
  "local_body": {                                   // municipality / corporation / panchayat
    "name": "Mayyanad",
    "type": "Grama Panchayat",                      // Grama Panchayat | Municipality | Corporation | ...
    "code": "G02053",                               // SEC Kerala code — stable join key
    "district": "Kollam",
    "summary": {                                    // 2025 LSGI tally for the whole body
      "total_wards": "24",
      "tally": { "LDF": "9", "UDF": "15", "NDA": "0", "OTH": "0" },
      "largest_front": "UDF",
      "majority_front": "UDF",
      "majority_number": "13"
    }
  },
  // LOWEST LEVEL — the ward the point falls in (always included)
  "ward": {
    "number": 14,
    "name": "MUKKOM WEST",
    "code": "G02053_14",                            // {body}_{ward} — stable join key
    "local_body_code": "G02053",                    // FK → local_body.code
    "representative": "Leena Lawrence",
    "winning_party": "INC",
    "winning_front": "UDF",
    "votes": "713",
    "election_year": "2025"
  },
  "assembly": {
    "name": "Eravipuram", "code": 125, "district": "KOLLAM",
    "parliamentary_constituency": "KOLLAM",
    "mla": "Adv Vishnu Mohan",
    "winning_party": "RSP",
    "winning_party_full": "Revolutionary Socialist Party",
    "winning_front": "UDF",
    "winning_front_full": "United Democratic Front"
  },
  "lok_sabha": {
    "name": "Kollam", "code": "18", "reservation": "GEN",
    "mp": "N K Premachandran",
    "winning_party": "RSP",
    "winning_party_full": "Revolutionary Socialist Party",
    "winning_front": "UDF",
    "electors": "1326648", "votes_polled": "915691",
    "turnout": "69.00%", "margin": "150302"
  },
  "took_ms": 87
}
```

Minimal ward extraction:

```js
const { civic_path, ward, local_body } = await fetch(
  `https://kerala-civic-lookup-api.onrender.com/lookup?lat=${lat}&lng=${lng}`
).then(r => r.json());
// ward.number, ward.name, ward.code, ward.representative
// local_body.name, local_body.type, local_body.code
// civic_path — ready-to-display string
```

## 3. Code snippets

### JavaScript / TypeScript (browser or Node)

```ts
const BASE = 'https://kerala-civic-lookup-api.onrender.com';

export async function lookupWard(lat: number, lng: number) {
  const url = `${BASE}/lookup?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 400) throw new Error('Invalid coordinates — pass numeric lat & lng.');
  if (res.status === 404) throw new Error('Point is outside Kerala / no boundary matched.');
  if (res.status === 429) throw new Error('Rate limited (60/min) — back off and retry.');
  if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status}).`);
  return res.json();
}

const r = await lookupWard(8.822321, 76.648518);
console.log(r.civic_path);            // MUKKOM WEST Ward 14, Mayyanad Grama Panchayat, Kollam
console.log(r.ward?.representative);  // Leena Lawrence
```

### Python (requests)

```python
import requests

BASE = "https://kerala-civic-lookup-api.onrender.com"

def lookup_ward(lat: float, lng: float, timeout: int = 30) -> dict:
    r = requests.get(f"{BASE}/lookup", params={"lat": lat, "lng": lng}, timeout=timeout)
    if r.status_code == 400:
        raise ValueError("Invalid coordinates — pass numeric lat & lng.")
    if r.status_code == 404:
        raise LookupError("Point is outside Kerala / no boundary matched.")
    if r.status_code == 429:
        raise RuntimeError("Rate limited (60/min) — back off and retry.")
    r.raise_for_status()
    return r.json()

r = lookup_ward(8.822321, 76.648518)
print(r["civic_path"])
print(r["ward"]["number"], r["ward"]["name"], r["ward"]["representative"])
```

### cURL (batch of points)

```bash
while IFS=, read lat lng; do
  curl -s "https://kerala-civic-lookup-api.onrender.com/lookup?lat=$lat&lng=$lng"
  echo
  sleep 1   # stay well under 60 req/min
done < points.csv
```

---

## 4. Errors & status codes

| Status | Body | Meaning | Action |
|---|---|---|---|
| 200 | full JSON above | Match found | Use `ward` / `local_body` |
| 400 | `Provide numeric ?lat= & ?lng=` | Bad/missing params | Validate client-side first |
| 404 | `Coordinates fall outside Kerala.` | Outside 7–13 / 74–78 bbox | Show "outside Kerala" |
| 404 | `No matching district found.` | Sea / boundary gap | Treat as "no civic body" |
| 429 | `Rate limit exceeded (60/min).` | Too fast from one IP | Backoff + cache |
| 500 | `Lookup failed.` | Server-side | Retry once, then alert |

`ward` / `local_body` can be `null` on rare boundary seams — null-check
before reading `.number` / `.name`.

---

## 5. Production guidance for your core app

- **Validate first**: numeric check + Kerala bbox (`7 ≤ lat ≤ 13`,
  `74 ≤ lng ≤ 78`) before calling.
- **Cache aggressively**: ward boundaries don't change between elections.
  Key on `round(lat,5),round(lng,5)` (~1 m) or on `ward.code` once resolved.
- **Debounce UI**: on map-drag / GPS-stream, debounce ≥ 500 ms, dedupe
  identical coords; stay far under 60 req/min per client IP.
- **Timeouts**: 15–30 s (first touch of a district loads ~2–15 MB;
  warm lookups are ~1–100 ms). Retry once on 429/500/cold-start.
- **Cold starts**: free Render sleeps after ~15 min idle — first call back
  takes ~30–60 s. Keep warm via a cron ping to `/health`, or show a
  "locating…" state on the very first call.
- **Join keys**: `local_body.code` (e.g. `G02053`) and `ward.code`
  (e.g. `G02053_14`) are stable — use them as FKs, not names.
- **Display string**: `civic_path` is ready-made for UI.
- **Data vintage**: ward member / party / votes = 2025 LSGI; MLA = 2026
  assembly; MP = 2024 Lok Sabha. Surface `election_year` where it matters.

## 6. Companion endpoints

| Endpoint | Use |
|---|---|
| `GET /health` | Liveness + warm indexes (`localBodyDistrictsLoaded`, `wardDistrictsLoaded`). Use for monitors / warmup pings. |
| `GET /districts` | `{"districts":[...]}` — 14 names for dropdowns / pre-validation. |
