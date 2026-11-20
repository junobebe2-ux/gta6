// Solmar City — static dev server (Node 22, standard library only).
// Serves game/ on :8080 (or $PORT) for local testing.
// Usage: node serve.ts   (or PORT=8901 node serve.ts)

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname || '.', 'game');
const port = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let path = join(root, url === '/' ? 'index.html' : url);
    if (!path.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

server.listen(port, () => console.log(`Solmar City serving game/ on :${port}`));
