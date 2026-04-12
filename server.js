'use strict';

const http = require('http');
const net  = require('net');
const fs   = require('fs');
const path = require('path');

// ── BlueMap reverse-proxy config ─────────────
// Set BLUEMAP_UPSTREAM to "host:port" of your BlueMap web server (default: 127.0.0.1:8100).
// Requests and WebSocket upgrades arriving with Host: map.doxnaf.online are forwarded there.
const BLUEMAP_UPSTREAM   = process.env.BLUEMAP_UPSTREAM || '127.0.0.1:8100';
const _bmLastColon       = BLUEMAP_UPSTREAM.lastIndexOf(':');
const BLUEMAP_PROXY_HOST = _bmLastColon === -1 ? BLUEMAP_UPSTREAM : BLUEMAP_UPSTREAM.slice(0, _bmLastColon);
const BLUEMAP_PROXY_PORT = _bmLastColon === -1 ? 8100 : (parseInt(BLUEMAP_UPSTREAM.slice(_bmLastColon + 1), 10) || 8100);

// ── Static file serving ───────────────────────
const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  // Images
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.ico':   'image/x-icon',
  '.svg':   'image/svg+xml',
  '.webp':  'image/webp',
  // Fonts
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  // Data
  '.json':  'application/json',
  // Audio
  '.mp3':   'audio/mpeg',
  '.ogg':   'audio/ogg',
  '.wav':   'audio/wav',
};

const httpServer = http.createServer((req, res) => {
  if (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // ── BlueMap reverse proxy ─────────────────────
  // Forward all HTTP requests for map.doxnaf.online to the BlueMap web server.
  const reqHost = (req.headers.host || '').split(':')[0].toLowerCase();
  if (reqHost === 'map.doxnaf.online') {
    const proxyReq = http.request(
      {
        hostname: BLUEMAP_PROXY_HOST,
        port:     BLUEMAP_PROXY_PORT,
        path:     req.url,
        method:   req.method,
        headers:  Object.assign({}, req.headers, { host: BLUEMAP_UPSTREAM }),
      },
      proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );
    proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('Bad Gateway'); } });
    req.pipe(proxyReq, { end: true });
    return;
  }

  const rawPath = (req.url || '/').split('?')[0];
  let urlPath;
  try { urlPath = decodeURIComponent(rawPath); } catch { res.writeHead(400); res.end('Bad Request'); return; }

  const file = (urlPath === '/' || urlPath === '/index.html') ? '/index.html' : urlPath;

  // Resolve the full path and ensure it stays inside __dirname
  const full = path.resolve(__dirname, '.' + file);
  if (!full.startsWith(path.resolve(__dirname) + path.sep) &&
      full !== path.resolve(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }

    const mimeExt = path.extname(full);
    const mime = MIME[mimeExt] || 'application/octet-stream';

    const headers = { 'Content-Type': mime };
    if (mime.startsWith('text/html')) {
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['Content-Security-Policy'] =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ── WebSocket upgrade router ──────────────────
// Connections for map.doxnaf.online are tunnelled directly to the BlueMap server via TCP.
httpServer.on('upgrade', (req, socket, head) => {
  const upgradeHost = (req.headers.host || '').split(':')[0].toLowerCase();
  if (upgradeHost === 'map.doxnaf.online') {
    const upstream = net.connect(BLUEMAP_PROXY_PORT, BLUEMAP_PROXY_HOST, () => {
      let rawHeaders = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const key = req.rawHeaders[i];
        const val = key.toLowerCase() === 'host' ? BLUEMAP_UPSTREAM : req.rawHeaders[i + 1];
        rawHeaders += `${key}: ${val}\r\n`;
      }
      rawHeaders += '\r\n';
      upstream.write(rawHeaders);
      if (head && head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    return;
  }
  socket.destroy();
});

// ── Start ─────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server → http://localhost:${PORT}`);
});
