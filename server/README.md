# Kerala Civic Lookup API (Option A MVP)

Public reverse-geocode API: send coordinates, get back the district, local body
(municipality / corporation / panchayat + type + code), and optionally the ward,
assembly and Lok Sabha constituency.

Reuses the project's [`geoIndex.js`](../react-kerala-map/src/geoIndex.js)
bbox + ray-casting lookup — no GIS database needed.

## Run

```bash
cd server
npm install
npm start            # PORT=3000 by default; PORT=8080 npm start to override
```

## Endpoints

| Method | Path | Example |
|---|---|---|
| GET | `/health` | `curl localhost:3000/health` |
| GET | `/districts` | list of 14 districts |
| GET | `/lookup?lat=&lng=` | `/lookup?lat=8.822321&lng=76.648518` |
| POST | `/lookup` | `{"lat":8.822321,"lng":76.648518}` |

`lng` also accepts `lon` / `longitude` aliases; `lat` accepts `latitude`.
Ward detail (the lowest administrative level) is always included.

### Example response

`GET /lookup?lat=8.822321&lng=76.648518` →

```json
{
  "query": { "lat": 8.822321, "lng": 76.648518 },
  "civic_path": "MUKKOM WEST Ward 14, Mayyanad Grama Panchayat, Kollam",
  "district": "Kollam",
  "local_body": {
    "name": "Mayyanad",
    "type": "Grama Panchayat",
    "code": "G02053",
    "district": "Kollam",
    "summary": {
      "total_wards": "24",
      "tally": { "LDF": "9", "UDF": "15", "NDA": "0", "OTH": "0" },
      "largest_front": "UDF",
      "majority_front": "UDF",
      "majority_number": "13"
    }
  },
  "ward": {
    "number": 14,
    "name": "MUKKOM WEST",
    "code": "G02053_14",
    "representative": "Leena Lawrence",
    "winning_party": "INC",
    "winning_front": "UDF",
    "votes": "713",
    "election_year": "2025"
  },
  "assembly": {
    "name": "Eravipuram",
    "code": 125,
    "mla": "Adv Vishnu Mohan",
    "winning_party": "RSP",
    "winning_front": "UDF"
  },
  "lok_sabha": {
    "name": "Kollam",
    "code": "18",
    "mp": "N K Premachandran",
    "winning_party": "RSP",
    "turnout": "69.00%"
  },
  "took_ms": 84
}
```

## How it works

1. **District first** — `districts.geojson` (14 features) classifies the point.
2. **Local body second** — only that district's `localbodies/{district}.geojson`
   is loaded + indexed (~2–5MB each), then cached in memory.
3. **Ward on demand** — `wards/{district}.geojson` only when `include=ward`.
4. **Constituencies** — small statewide Lok Sabha (20) + Assembly (140) indexes
   stay in memory; LSGI summary lookup enriches the local-body block.

Memory stays small (~tens of MB warm per active district) since we never load
all 14 districts' boundaries at once. Rate limit: 60 req/min per IP.

## Hosting (free, always-on URL)

The included [`render.yaml`](../render.yaml) deploys this to **Render's free tier**
in a few clicks — no Docker needed:

1. Commit + push everything (data included — it's already tracked in git):
   ```bash
   git add .gitignore render.yaml server/server.mjs server/README.md
   git commit -m "chore: free Render deploy for civic lookup API"
   git push origin main
   ```
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Blueprint** → select your repo. Render reads `render.yaml` and creates the
   web service (`npm install` → `npm start`, health check on `/health`).
3. Wait ~2–3 min for the first build. Your API is then live at
   `https://kerala-civic-lookup-api.onrender.com`:
   ```bash
   curl "https://kerala-civic-lookup-api.onrender.com/lookup?lat=8.822321&lng=76.648518"
   ```

Caveats of the free tier:

- **Spin-down**: after ~15 min idle the service sleeps; the next request takes
  ~30–60 s (cold start re-indexes the ~7 MB boot files). Keep it warm with a
  free [UptimeRobot](https://uptimerobot.com) / [cron-job.org](https://cron-job.org)
  ping to `/health` every 10 min.
- **512 MB RAM**: fine — the server lazy-loads one district (~2–15 MB) per
  request and caches it; it never holds all 200 MB at once.
- **750 hrs/month**: enough for one always-on service.

Alternatives: **Railway** (free trial credit, same `npm start`), **Fly.io**
(free allowances, needs `fly launch`), **Hugging Face Spaces** (free, Docker).
Any host works as long as the `data/` directory ships alongside `server/`
(`DATA = join(HERE, '..', 'data')` in `geoService.mjs`).
