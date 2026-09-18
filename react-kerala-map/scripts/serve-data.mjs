#!/usr/bin/env node
/**
 * Static file server with CORS headers for local testing of react-kerala-map.
 *
 * The library fetches all of its GeoJSON over HTTP, and `python -m
 * http.server` does not send `Access-Control-Allow-Origin`, so a browser page
 * served from a different origin (the demo dev server, for example) is blocked
 * from reading the response. This server always sends the header.
 *
 *   node scripts/serve-data.mjs                    # repo root on port 8766
 *   node scripts/serve-data.mjs 9000               # custom port
 *   node scripts/serve-data.mjs 9000 /tmp/packaged # serve any directory
 *
 * The default root is the repository this package lives in, so the served
 * layout mirrors the hosted one and you get both entry points:
 *   http://localhost:8766/           -> the original Kerala Representative Map
 *   http://localhost:8766/data/      -> the GeoJSON data directory
 *
 * Point the demo at the local data:
 *   http://localhost:5174/?data=http://localhost:8766/data/
 *
 * A directory request serves its index.html (handy for previewing the UMD
 * build of a packed tarball). Not part of the published package (`files` only
 * includes dist, index.d.ts and README.md).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8766);
const ROOT = resolve(process.argv[3] || process.env.ROOT_DIR || join(HERE, '..', '..'));

const MIME = {
  '.geojson': 'application/geo+json',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path.endsWith('/')) path += 'index.html';

  try {
    const file = join(ROOT, path);
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}/`);
});