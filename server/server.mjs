import express from 'express';
import cors from 'cors';
import { createGeoService } from './geoService.mjs';

const PORT = Number(process.env.PORT || 3000);
const app = express();

// Render (and other proxies) hand us the real client IP via X-Forwarded-For.
// Without this, express-rate-limit-style IP keys all collapse to one value.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// --- simple in-memory rate limit: 60 req/min per IP ---
// NOTE: on serverless (Vercel/Cloudflare) each isolate has its own map,
// so this is a best-effort guard, not a global quota.
const hits = new Map();
app.use((req, res, next) => {
  // Skip the platform / uptime health probes so they never eat quota.
  if (req.path === '/health') return next();
  const now = Date.now();
  const arr = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(req.ip, arr);
  if (arr.length > 60) return res.status(429).json({ error: 'Rate limit exceeded (60/min).' });
  next();
});


const geo = await createGeoService();
console.log('Geo indexes ready.');

app.get('/health', (req, res) => {
  res.json({ ok: true, ...geo.cacheStats() });
});

app.get('/districts', (req, res) => {
  res.json({ districts: geo.districts });
});

async function handleLookup(latRaw, lngRaw, res) {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Provide numeric ?lat= & ?lng= (or ?lon=).' });
  }
  if (lat < 7 || lat > 13 || lng < 74 || lng > 78) {
    return res.status(404).json({ error: 'Coordinates fall outside Kerala.' });
  }

  try {
    const t0 = Date.now();
    const result = await geo.lookup(lat, lng);
    if (!result) return res.status(404).json({ error: 'No matching district found.' });
    res.json({ ...result, took_ms: Date.now() - t0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed.' });
  }
}

/**
 * GET /lookup?lat=8.822321&lng=76.648518
 * Also accepts `lon` as an alias for `lng`. Ward detail is always included —
 * it is the lowest administrative level in the data.
 */
app.get('/lookup', async (req, res) => {
  await handleLookup(
    req.query.lat ?? req.query.latitude,
    req.query.lng ?? req.query.lon ?? req.query.longitude,
    res
  );
});

/** POST /lookup  { "lat": 8.822321, "lng": 76.648518 } — handy for batch clients */
app.post('/lookup', async (req, res) => {
  const { lat, lng, lon, latitude, longitude } = req.body || {};
  await handleLookup(
    lat ?? latitude,
    lng ?? lon ?? longitude,
    res
  );
});

app.listen(PORT, () => {
  console.log(`Kerala civic lookup API on http://localhost:${PORT}`);
  console.log('  GET /lookup?lat=8.822321&lng=76.648518');
});
