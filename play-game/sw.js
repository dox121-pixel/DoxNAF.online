/* play-game/sw.js — Service Worker for the Unity drag-and-drop game runner.
 *
 * Files dropped by the user are sent here via postMessage and stored in
 * memory.  Any fetch request whose path starts with /play-game/runtime/
 * is intercepted and fulfilled from that in-memory store, so the Unity
 * WebGL loader can resolve all relative asset URLs transparently.
 */
'use strict';

// ── MIME lookup ────────────────────────────────────────────────────────────
const MIME_MAP = {
  '.html'      : 'text/html; charset=utf-8',
  '.htm'       : 'text/html; charset=utf-8',
  '.css'       : 'text/css',
  '.js'        : 'application/javascript',
  '.mjs'       : 'application/javascript',
  '.wasm'      : 'application/wasm',
  '.data'      : 'application/octet-stream',
  '.unityweb'  : 'application/octet-stream',
  '.json'      : 'application/json',
  '.xml'       : 'application/xml',
  '.txt'       : 'text/plain',
  '.png'       : 'image/png',
  '.jpg'       : 'image/jpeg',
  '.jpeg'      : 'image/jpeg',
  '.gif'       : 'image/gif',
  '.webp'      : 'image/webp',
  '.svg'       : 'image/svg+xml',
  '.ico'       : 'image/x-icon',
  '.mp3'       : 'audio/mpeg',
  '.ogg'       : 'audio/ogg',
  '.wav'       : 'audio/wav',
  '.mp4'       : 'video/mp4',
  '.webm'      : 'video/webm',
  '.ttf'       : 'font/ttf',
  '.woff'      : 'font/woff',
  '.woff2'     : 'font/woff2',
};

function getMime(filename) {
  const lower = filename.toLowerCase();
  // Strip Unity compression suffixes (.gz / .br) to find the real type
  const stripped = lower.endsWith('.gz') || lower.endsWith('.br')
    ? lower.slice(0, lower.lastIndexOf('.'))
    : lower;
  const dot = stripped.lastIndexOf('.');
  if (dot !== -1) {
    const ext = stripped.slice(dot);
    if (MIME_MAP[ext]) return MIME_MAP[ext];
  }
  return 'application/octet-stream';
}

// ── In-memory file store ───────────────────────────────────────────────────
// Map: normalised path (no leading slash) → { buffer: ArrayBuffer, mime: string }
const gameFiles = new Map();

// ── Lifecycle ─────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Message handler ────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || !msg.action) return;

  switch (msg.action) {
    case 'clear':
      gameFiles.clear();
      break;

    case 'add-file': {
      // Normalise path: strip leading slash, convert backslashes
      const norm = msg.path.replace(/\\/g, '/').replace(/^\/+/, '');
      gameFiles.set(norm, {
        buffer : msg.buffer,
        mime   : msg.mime || getMime(msg.path),
      });
      break;
    }

    case 'ready':
      // Broadcast to all pages that the game files are ready
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({
          action : 'files-ready',
          count  : gameFiles.size,
        }));
      });
      break;

    default:
      break;
  }
});

// ── Fetch interceptor ─────────────────────────────────────────────────────
const RUNTIME_PREFIX = '/play-game/runtime/';

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(RUNTIME_PREFIX)) return;

  event.respondWith((async () => {
    const filePath = url.pathname.slice(RUNTIME_PREFIX.length);

    // Exact match
    if (gameFiles.has(filePath)) {
      const entry = gameFiles.get(filePath);
      return makeResponse(entry);
    }

    // Root fallback → index.html (filePath is '' when the URL ends with the prefix)
    if (filePath === '' && gameFiles.has('index.html')) {
      return makeResponse(gameFiles.get('index.html'));
    }

    return new Response('File not found in game bundle: ' + filePath, {
      status  : 404,
      headers : { 'Content-Type': 'text/plain' },
    });
  })());
});

function makeResponse(entry) {
  const headers = { 'Content-Type': entry.mime };
  // Allow SharedArrayBuffer (needed by some Unity versions)
  headers['Cross-Origin-Opener-Policy']   = 'same-origin';
  headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  return new Response(entry.buffer, { status: 200, headers });
}
