// ─────────────────────────────────────────────
//  VIPER.exe — Online Multiplayer Server
//  Usage: npm install && npm start
//  Then open http://localhost:3001 in two browsers
// ─────────────────────────────────────────────
'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const { Pool } = require('pg');

const COLS    = 40;
const ROWS    = 40;
const TICK_MS = 120;

// ── Leaderboard (PostgreSQL) ──────────────────
const MAX_LEADERBOARD_ENTRIES = 10;

const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

// ── Admin authentication ──────────────────────
const ADMIN_SESSION_TTL_MS = 3600000; // 1 hour
const adminSessions = new Map(); // token → expiry timestamp

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

// Pre-computed default password hash (used when DB is unavailable)
const DEFAULT_ADMIN_HASH = hashPassword('GMMKVIPER');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidAdminToken(token) {
  if (!token) return false;
  const expiry = adminSessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { adminSessions.delete(token); return false; }
  return true;
}

async function getAdminPasswordHash() {
  if (!dbPool) return null;
  const res = await dbPool.query(
    `SELECT value FROM admin_settings WHERE key = 'password_hash' LIMIT 1`
  );
  return res.rows.length ? res.rows[0].value : null;
}

async function initDb() {
  if (!dbPool) { console.warn('DATABASE_URL not set -- leaderboard persistence disabled.'); return; }
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      name         VARCHAR(30)  PRIMARY KEY,
      score        INTEGER      NOT NULL DEFAULT 0,
      apples_eaten INTEGER      NOT NULL DEFAULT 0,
      date         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key   VARCHAR(50)  PRIMARY KEY,
      value TEXT         NOT NULL
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_removals (
      name       VARCHAR(30)  PRIMARY KEY,
      removed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS nightmare_leaderboard (
      name         VARCHAR(30)  PRIMARY KEY,
      score        INTEGER      NOT NULL DEFAULT 0,
      apples_eaten INTEGER      NOT NULL DEFAULT 0,
      date         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  // Store the admin password hash if not already set
  await dbPool.query(
    `INSERT INTO admin_settings (key, value)
     VALUES ('password_hash', $1)
     ON CONFLICT (key) DO NOTHING`,
    [DEFAULT_ADMIN_HASH]
  );
}

async function deleteLeaderboardEntry(name) {
  if (!dbPool) return;
  const safeName = String(name).slice(0, 30);
  await dbPool.query(`DELETE FROM leaderboard WHERE name = $1`, [safeName]);
  await dbPool.query(
    `INSERT INTO leaderboard_removals (name, removed_at)
     VALUES ($1, NOW())
     ON CONFLICT (name) DO UPDATE SET removed_at = NOW()`,
    [safeName]
  );
}

async function checkLeaderboardRemoval(name) {
  if (!dbPool) return false;
  const safeName = String(name).slice(0, 30);
  const res = await dbPool.query(
    `SELECT 1 FROM leaderboard_removals WHERE name = $1 LIMIT 1`,
    [safeName]
  );
  return res.rows.length > 0;
}

async function getLeaderboardFromDb() {
  if (!dbPool) return [];
  const res = await dbPool.query(
    `SELECT name, score, apples_eaten AS "applesEaten", date
       FROM leaderboard
      ORDER BY score DESC
      LIMIT $1`,
    [MAX_LEADERBOARD_ENTRIES]
  );
  return res.rows;
}

async function addLeaderboardEntry(name, score, applesEaten) {
  // Sanitize input
  let safeName = String(name || 'Anonymous').slice(0, 30).replace(/[^\x20-\x7E]/g, '').trim() || 'Anonymous';
  // Replace banned names silently with Anonymous
  if (containsBannedWord(safeName)) safeName = 'Anonymous';
  const safeScore  = Math.max(0, Math.min(1e7, Math.floor(Number(score) || 0)));
  const safeApples = Math.max(0, Math.min(1e6, Math.floor(Number(applesEaten) || 0)));

  if (!dbPool) return;
  await dbPool.query(
    `INSERT INTO leaderboard (name, score, apples_eaten, date)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name) DO UPDATE
       SET score        = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.score        ELSE leaderboard.score        END,
           apples_eaten = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.apples_eaten ELSE leaderboard.apples_eaten END,
           date         = CASE WHEN EXCLUDED.score > leaderboard.score THEN NOW()                 ELSE leaderboard.date         END`,
    [safeName, safeScore, safeApples]
  );
}

async function getNightmareLeaderboardFromDb() {
  if (!dbPool) return [];
  const res = await dbPool.query(
    `SELECT name, score, apples_eaten AS "applesEaten", date
       FROM nightmare_leaderboard
      ORDER BY score DESC
      LIMIT $1`,
    [MAX_LEADERBOARD_ENTRIES]
  );
  return res.rows;
}

async function addNightmareLeaderboardEntry(name, score, applesEaten) {
  let safeName = String(name || 'Anonymous').slice(0, 30).replace(/[^\x20-\x7E]/g, '').trim() || 'Anonymous';
  if (containsBannedWord(safeName)) safeName = 'Anonymous';
  const safeScore  = Math.max(0, Math.min(1e7, Math.floor(Number(score) || 0)));
  const safeApples = Math.max(0, Math.min(1e6, Math.floor(Number(applesEaten) || 0)));

  if (!dbPool) return;
  await dbPool.query(
    `INSERT INTO nightmare_leaderboard (name, score, apples_eaten, date)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name) DO UPDATE
       SET score        = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.score        ELSE nightmare_leaderboard.score        END,
           apples_eaten = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.apples_eaten ELSE nightmare_leaderboard.apples_eaten END,
           date         = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN NOW()                 ELSE nightmare_leaderboard.date         END`,
    [safeName, safeScore, safeApples]
  );
}

async function deleteNightmareLeaderboardEntry(name) {
  if (!dbPool) return;
  const safeName = String(name).slice(0, 30);
  await dbPool.query(`DELETE FROM nightmare_leaderboard WHERE name = $1`, [safeName]);
}

// ── Slur / hate-speech filter ─────────────────
// Normalize common leet substitutions then check for banned substrings.
const BANNED_WORDS = [
  'nigger', 'nigga', 'faggot', 'kike', 'chink',
  'coon', 'spook', 'tranny', 'gook', 'wetback',
  'cracker', 'beaner', 'zipperhead', 'slant',
];

function normalizeForFilter(str) {
  return str.toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/@/g, 'a')
    .replace(/\$/g, 's').replace(/!/g, 'i').replace(/\|/g, 'i');
}

function containsBannedWord(str) {
  const norm = normalizeForFilter(str);
  if (BANNED_WORDS.some(w => norm.includes(w))) return true;
  // "fag" blocked as whole word; "faggot" already caught above
  if (/\bfag\b/.test(norm)) return true;
  // "spic" blocked unless immediately followed by 'e' or 'y' (spice / spicy)
  if (/spic(?![ey])/.test(norm)) return true;
  return false;
}

// ── Smooth-snake physics (mirrors singleplayer) ──
const SEG_SPACING   = 0.45;
const SNAKE_RADIUS  = 0.28;
const SELF_HIT_SKIP = 8;
const APPLE_EAT_DIST = 0.70;
const PERK_PICK_DIST = 0.55;
const MAX_TURN_SPD  = 4.5;   // radians per second
const BASE_INTERVAL = 140;   // ms per grid-cell (speed baseline)
const INIT_SEGS     = 10;
const GROW_PER_APPLE = Math.max(1, Math.round(2 / SEG_SPACING)); // ≈ 4 segments per apple (2 grid-cells of growth)

// ── Static file serving ───────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

const httpServer = http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0];
  let urlPath;
  try { urlPath = decodeURIComponent(rawPath); } catch { res.writeHead(400); res.end('Bad Request'); return; }

  // ── Leaderboard removal check ─────────────────
  if (urlPath === '/api/leaderboard/check-removal') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    const qs = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(qs);
    const name = String(params.get('name') || '').slice(0, 30);
    if (!name) { res.writeHead(400); res.end('Bad Request'); return; }
    checkLeaderboardRemoval(name).then(removed => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ removed }));
    }).catch(err => {
      console.error('Check removal error:', err.message);
      res.writeHead(500); res.end('Internal Server Error');
    });
    return;
  }

  // ── Leaderboard API ───────────────────────────
  if (urlPath === '/api/leaderboard') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      getLeaderboardFromDb().then(entries => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ entries }));
      }).catch(err => {
        console.error('Leaderboard GET error:', err.message);
        res.writeHead(500); res.end('Internal Server Error');
      });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          addLeaderboardEntry(d.name, d.score, d.applesEaten).then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: true }));
          }).catch(err => {
            console.error('Leaderboard POST error:', err.message);
            res.writeHead(500); res.end('Internal Server Error');
          });
        } catch (_) {
          res.writeHead(400); res.end('Bad Request');
        }
      });
      return;
    }
    res.writeHead(405); res.end('Method Not Allowed');
    return;
  }

  // ── Nightmare Leaderboard API ─────────────────
  if (urlPath === '/api/nightmare-leaderboard') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      getNightmareLeaderboardFromDb().then(entries => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ entries }));
      }).catch(err => {
        console.error('Nightmare leaderboard GET error:', err.message);
        res.writeHead(500); res.end('Internal Server Error');
      });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          addNightmareLeaderboardEntry(d.name, d.score, d.applesEaten).then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: true }));
          }).catch(err => {
            console.error('Nightmare leaderboard POST error:', err.message);
            res.writeHead(500); res.end('Internal Server Error');
          });
        } catch (_) {
          res.writeHead(400); res.end('Bad Request');
        }
      });
      return;
    }
    res.writeHead(405); res.end('Method Not Allowed');
    return;
  }

  // ── Admin API ─────────────────────────────────
  const adminCors = {
    'Access-Control-Allow-Origin': 'https://doxnaf.online',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (urlPath === '/api/admin/login') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512) req.destroy(); });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        getAdminPasswordHash().then(storedHash => {
          if (!storedHash) {
            // DB not available; compare directly against in-memory default
            if (hashPassword(String(password || '')) !== DEFAULT_ADMIN_HASH) {
              res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
              res.end(JSON.stringify({ ok: false }));
              return;
            }
          } else if (hashPassword(String(password || '')) !== storedHash) {
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const token = generateToken();
          adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true, token }));
        }).catch(err => {
          console.error('Admin login DB error:', err.message);
          // DB unavailable — fall back to in-memory default hash
          if (hashPassword(String(password || '')) !== DEFAULT_ADMIN_HASH) {
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const token = generateToken();
          adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true, token }));
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/admin/verify') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        const valid = isValidAdminToken(token);
        res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json', ...adminCors });
        res.end(JSON.stringify({ ok: valid }));
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/admin/leaderboard/delete') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, name } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        deleteLeaderboardEntry(name).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true }));
        }).catch(err => {
          console.error('Leaderboard delete error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (e) {
        console.error('Admin leaderboard delete parse error:', e.message);
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/admin/nightmare-leaderboard/delete') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, name } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        deleteNightmareLeaderboardEntry(name).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true }));
        }).catch(err => {
          console.error('Nightmare leaderboard delete error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (e) {
        console.error('Admin nightmare leaderboard delete parse error:', e.message);
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // ── Admin: list singleplayer sessions ───────────
  if (urlPath === '/api/admin/sp-sessions') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        const now = Date.now();
        const sessions = [];
        for (const [sessionId, sess] of spSessions) {
          if (sess.ws.readyState === WebSocket.OPEN) {
            sessions.push({
              sessionId,
              playerName: sess.playerName,
              elapsedSec: Math.floor((now - sess.startTime) / 1000),
            });
          } else {
            spSessions.delete(sessionId);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
        res.end(JSON.stringify({ ok: true, sessions }));
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // ── Admin: send command to singleplayer session ──
  if (urlPath === '/api/admin/sp-command') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, sessionId, command } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        if (!SP_VALID_COMMANDS.has(command)) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Invalid command' }));
          return;
        }
        const safeId = String(sessionId || '').replace(/[^0-9a-f]/gi, '').slice(0, 16);
        const sess = spSessions.get(safeId);
        if (!sess || sess.ws.readyState !== WebSocket.OPEN) {
          res.writeHead(404, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Session not found' }));
          return;
        }
        sess.ws.send(JSON.stringify({ type: command }));
        res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('Admin sp-command error:', e.message);
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // ── Admin: get spectate snapshot for a singleplayer session ──
  if (urlPath === '/api/admin/sp-spectate') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, sessionId } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        const safeId = String(sessionId || '').replace(/[^0-9a-f]/gi, '').slice(0, 16);
        const sess = spSessions.get(safeId);
        if (!sess || sess.ws.readyState !== WebSocket.OPEN) {
          res.writeHead(404, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Session not found' }));
          return;
        }
        // Request a fresh state snapshot from the player's game
        sess.ws.send(JSON.stringify({ type: 'sp_request_state' }));
        // Return whatever snapshot we have (updated asynchronously by sp_state_update)
        res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
        res.end(JSON.stringify({ ok: true, snapshot: sess.lastSnapshot }));
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  const file    = urlPath === '/' ? '/index.html' : urlPath;
  // Resolve the full path and ensure it stays inside __dirname
  const full    = path.resolve(__dirname, '.' + file);
  if (!full.startsWith(path.resolve(__dirname) + path.sep) &&
      full !== path.resolve(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const mime = MIME[path.extname(full)] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

const rooms = new Map(); // code → room

// ── Singleplayer session tracking ─────────────
const spSessions = new Map(); // sessionId → { ws, playerName, startTime, lastSnapshot }
const SP_VALID_COMMANDS = new Set(['sp_spawn_enemy', 'sp_spawn_apple', 'sp_spawn_chest', 'sp_toggle_nightmare']);

// ── Quick-play matchmaking ─────────────────────
const matchmakingQueue    = []; // entries: { room, botTimeout }
const QUICK_PLAY_WAIT_MS  = 8000; // milliseconds to wait for PvP before spawning a bot

// ── Helpers ───────────────────────────────────
function randInt(n) { return Math.floor(Math.random() * n); }

function normalizeAngle(a) {
  while (a > Math.PI)  a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function wrappedDiff(a, b, size) {
  let d = a - b;
  if (d > size / 2)  d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function genCode() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => CHARS[randInt(CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function randomTeleportPerk(snakes, apples, teleportPerks) {
  const occ = new Set();
  for (const sn of snakes) for (const c of sn.body) occ.add(`${Math.round(c.x)},${Math.round(c.y)}`);
  for (const a of apples)                             occ.add(`${a.x},${a.y}`);
  for (const tp of teleportPerks)                     occ.add(`${tp.x},${tp.y}`);
  let cell, tries = 0;
  do {
    cell = { x: randInt(COLS), y: randInt(ROWS) };
    tries++;
  } while (occ.has(`${cell.x},${cell.y}`) && tries < 400);
  return cell;
}

function randomApple(snakes, apples) {
  const occ = new Set();
  for (const sn of snakes) for (const c of sn.body) occ.add(`${Math.round(c.x)},${Math.round(c.y)}`);
  for (const a of apples)                             occ.add(`${a.x},${a.y}`);
  let cell, tries = 0;
  do {
    cell = { x: randInt(COLS), y: randInt(ROWS) };
    tries++;
  } while (occ.has(`${cell.x},${cell.y}`) && tries < 400);
  return cell;
}

function createGameState() {
  const snakes = [
    {
      body:         Array.from({ length: INIT_SEGS }, (_, i) => ({ x: 10 - i * SEG_SPACING, y: 20 })),
      angle:        0,
      targetAngle:  0,
      growBuffer:   0,
      alive:        true,
      score:        0,
      teleportCharges: 0,
    },
    {
      body:         Array.from({ length: INIT_SEGS }, (_, i) => ({ x: 30 + i * SEG_SPACING, y: 20 })),
      angle:        Math.PI,
      targetAngle:  Math.PI,
      growBuffer:   0,
      alive:        true,
      score:        0,
      teleportCharges: 0,
    },
  ];
  const apples = [
    randomApple(snakes, []),
    randomApple(snakes, []),
  ];
  const teleportPerks = [randomTeleportPerk(snakes, apples, [])];
  return { snakes, apples, teleportPerks, tick: 0 };
}

// ── Game tick (authoritative server-side logic) ──
function tickGame(room) {
  const gs = room.gameState;
  gs.tick++;
  const dt = TICK_MS;

  for (let p = 0; p < 2; p++) {
    const sn = gs.snakes[p];
    if (!sn.alive) continue;

    // 1. Smooth-rotate toward target angle
    const diff    = normalizeAngle(sn.targetAngle - sn.angle);
    const maxTurn = MAX_TURN_SPD * dt / 1000;
    sn.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // 2. Advance head
    const speed = dt / BASE_INTERVAL;
    const head  = sn.body[0];
    let nx = head.x + Math.cos(sn.angle) * speed;
    let ny = head.y + Math.sin(sn.angle) * speed;

    // Wall wrapping
    nx = ((nx % COLS) + COLS) % COLS;
    ny = ((ny % ROWS) + ROWS) % ROWS;

    // 3. Self-collision (skip first SELF_HIT_SKIP segments)
    let selfHit = false;
    for (let i = SELF_HIT_SKIP; i < sn.body.length; i++) {
      const s = sn.body[i];
      const bx = s.x - nx, by = s.y - ny;
      if (bx * bx + by * by < SNAKE_RADIUS * SNAKE_RADIUS * 4) { selfHit = true; break; }
    }
    if (selfHit) { sn.alive = false; continue; }

    // 4. Move head
    head.x = nx;
    head.y = ny;

    // 5. Chain body: each segment follows the one ahead
    for (let i = 1; i < sn.body.length; i++) {
      const prev = sn.body[i - 1];
      const seg  = sn.body[i];
      const dx   = wrappedDiff(seg.x, prev.x, COLS);
      const dy   = wrappedDiff(seg.y, prev.y, ROWS);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SEG_SPACING) {
        const f  = SEG_SPACING / dist;
        seg.x = ((prev.x + dx * f) % COLS + COLS) % COLS;
        seg.y = ((prev.y + dy * f) % ROWS + ROWS) % ROWS;
      }
    }

    // 6. Grow
    if (sn.growBuffer > 0) {
      const last = sn.body[sn.body.length - 1];
      sn.body.push({ x: last.x, y: last.y });
      sn.growBuffer--;
    }

    // 7. Apple eating (distance-based)
    for (let i = gs.apples.length - 1; i >= 0; i--) {
      const a  = gs.apples[i];
      const dx = a.x - nx, dy = a.y - ny;
      if (dx * dx + dy * dy < APPLE_EAT_DIST * APPLE_EAT_DIST) {
        gs.apples.splice(i, 1);
        sn.score++;
        sn.growBuffer += GROW_PER_APPLE;
        gs.apples.push(randomApple(gs.snakes, gs.apples));
      }
    }

    // 8. Teleport perk collection (distance-based)
    for (let i = gs.teleportPerks.length - 1; i >= 0; i--) {
      const tp = gs.teleportPerks[i];
      const dx = tp.x - nx, dy = tp.y - ny;
      if (dx * dx + dy * dy < PERK_PICK_DIST * PERK_PICK_DIST) {
        gs.teleportPerks.splice(i, 1);
        sn.teleportCharges++;
        gs.teleportPerks.push(randomTeleportPerk(gs.snakes, gs.apples, gs.teleportPerks));
      }
    }
  }

  // 9. Head-to-head collision
  const [sn0, sn1] = gs.snakes;
  if (sn0.alive && sn1.alive) {
    const h0 = sn0.body[0], h1 = sn1.body[0];
    const dx = h0.x - h1.x, dy = h0.y - h1.y;
    if (dx * dx + dy * dy < SNAKE_RADIUS * SNAKE_RADIUS * 4) {
      sn0.alive = false;
      sn1.alive = false;
    }
  }

  // 10. Head vs opponent body collision
  for (let p = 0; p < 2; p++) {
    if (!gs.snakes[p].alive) continue;
    const h   = gs.snakes[p].body[0];
    const opp = gs.snakes[1 - p];
    if (!opp.alive) continue;
    for (let i = 1; i < opp.body.length; i++) {
      const s  = opp.body[i];
      const dx = s.x - h.x, dy = s.y - h.y;
      if (dx * dx + dy * dy < SNAKE_RADIUS * SNAKE_RADIUS * 4) {
        gs.snakes[p].alive = false;
        break;
      }
    }
  }
}

// ── Room helpers ──────────────────────────────
function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.clients) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function sendTo(room, idx, msg) {
  const ws = room.clients[idx];
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function checkGameOver(room) {
  const gs    = room.gameState;
  const alive = gs.snakes.filter(s => s.alive);
  if (alive.length >= 2) return false;

  clearInterval(room.ticker);
  room.ticker = null;

  const winner = alive.length === 1 ? gs.snakes.indexOf(alive[0]) : -1;
  broadcast(room, {
    type:   'game_over',
    winner,
    scores: gs.snakes.map(s => s.score),
  });
  room.phase        = 'over';
  room.rematchVotes = 0;
  return true;
}

// ── Bot AI ────────────────────────────────────
function tickBot(room) {
  const gs     = room.gameState;
  const bot    = gs.snakes[1];
  const player = gs.snakes[0];
  if (!bot || !bot.alive || !player || !player.alive) return;

  const bs   = room.botState;
  const head = bot.body[0];
  const ph   = player.body[0];

  // Wrapped distance components to the player
  const dx   = wrappedDiff(ph.x, head.x, COLS);
  const dy   = wrappedDiff(ph.y, head.y, ROWS);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Determine bot mode
  const now        = Date.now();
  const canSurprise = bot.teleportCharges > 0 && dist < 16 && (now - bs.lastTeleport) > 4000;

  if (canSurprise) {
    bs.mode = 'surprise';
  } else if (dist < 12) {
    bs.mode = 'attack';
  } else if (dist < 26) {
    bs.mode = 'stalk';
  } else {
    bs.mode = 'idle';
  }

  switch (bs.mode) {

    case 'surprise': {
      // Orient toward player; execute teleport once aligned
      const a2p = Math.atan2(dy, dx);
      bot.targetAngle = a2p;
      const angleDiff = Math.abs(normalizeAngle(bot.angle - a2p));
      if (bot.teleportCharges > 0 && angleDiff < 0.6 && dist > 2) {
        bot.teleportCharges--;
        const TDIST = 5;
        bot.body = bot.body.map(seg => ({
          x: ((seg.x + Math.cos(bot.angle) * TDIST) % COLS + COLS) % COLS,
          y: ((seg.y + Math.sin(bot.angle) * TDIST) % ROWS + ROWS) % ROWS,
        }));
        bs.lastTeleport = now;
        bs.mode = 'attack';
      }
      break;
    }

    case 'attack': {
      bot.targetAngle = Math.atan2(dy, dx);
      break;
    }

    case 'stalk': {
      const a2p = Math.atan2(dy, dx);
      // Approach at an offset angle to avoid head-on collision and position for a side attack
      if (dist > 10) {
        bot.targetAngle = normalizeAngle(a2p + Math.PI / 3);
      } else {
        // Close enough — orbit the player waiting for the right moment
        bot.targetAngle = normalizeAngle(a2p + Math.PI / 2);
      }
      break;
    }

    case 'idle': {
      // Seek the nearest apple; prefer teleport perks (for future surprise attacks)
      let bestScore = Infinity;
      let bestAngle = bot.angle;

      for (const apple of gs.apples) {
        const adx = wrappedDiff(apple.x, head.x, COLS);
        const ady = wrappedDiff(apple.y, head.y, ROWS);
        const s   = adx * adx + ady * ady;
        if (s < bestScore) { bestScore = s; bestAngle = Math.atan2(ady, adx); }
      }

      for (const tp of gs.teleportPerks) {
        const tdx = wrappedDiff(tp.x, head.x, COLS);
        const tdy = wrappedDiff(tp.y, head.y, ROWS);
        const s   = (tdx * tdx + tdy * tdy) * 0.75; // 25 % preference bonus for perks
        if (s < bestScore) { bestScore = s; bestAngle = Math.atan2(tdy, tdx); }
      }

      bot.targetAngle = bestAngle;
      break;
    }
  }
}

function startGame(room) {
  if (room.ticker) { clearInterval(room.ticker); room.ticker = null; }
  room.gameState    = createGameState();
  room.phase        = 'playing';
  room.rematchVotes = 0;

  if (room.isBot) room.botState = { mode: 'idle', lastTeleport: 0 };

  broadcast(room, { type: 'game_start', state: room.gameState, isBot: room.isBot || false });

  room.ticker = setInterval(() => {
    if (room.phase !== 'playing') return;
    if (room.isBot) tickBot(room);
    tickGame(room);
    if (!checkGameOver(room)) {
      broadcast(room, { type: 'game_tick', state: room.gameState });
    }
  }, TICK_MS);
}

function closeRoom(room) {
  if (room.ticker) { clearInterval(room.ticker); room.ticker = null; }
  rooms.delete(room.code);
  room.clients[0] = null;
  room.clients[1] = null;
}

// ── WebSocket connection handling ─────────────
wss.on('connection', ws => {
  let playerRoom = null;
  let playerIdx  = -1;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create_room': {
        if (playerRoom) return;
        const code = genCode();
        playerRoom = {
          code,
          clients:      [ws, null],
          gameState:    null,
          phase:        'waiting',
          ticker:       null,
          rematchVotes: 0,
          isBot:        false,
        };
        rooms.set(code, playerRoom);
        playerIdx = 0;
        ws.send(JSON.stringify({ type: 'room_created', code, player: 0 }));
        break;
      }

      case 'quick_play': {
        if (playerRoom) return;

        // Try to pair with a player already waiting in the matchmaking queue
        const queued = matchmakingQueue.shift();
        if (queued && queued.room.clients[0] &&
            queued.room.clients[0].readyState === WebSocket.OPEN) {
          // PvP match found — cancel the bot fallback timer and start the game
          clearTimeout(queued.botTimeout);
          const room   = queued.room;
          room.clients[1] = ws;
          playerRoom   = room;
          playerIdx    = 1;
          ws.send(JSON.stringify({ type: 'room_joined', code: room.code, player: 1 }));
          startGame(room);
        } else {
          // No match yet — put the player in a room and queue them
          if (queued) clearTimeout(queued.botTimeout); // discard stale entry
          const code = genCode();
          playerRoom = {
            code,
            clients:      [ws, null],
            gameState:    null,
            phase:        'waiting',
            ticker:       null,
            rematchVotes: 0,
            isBot:        false,
          };
          rooms.set(code, playerRoom);
          playerIdx = 0;
          ws.send(JSON.stringify({ type: 'room_created', code, player: 0 }));

          // After QUICK_PLAY_WAIT_MS with no opponent, fall back to a bot
          const entry = { room: playerRoom, botTimeout: null };
          entry.botTimeout = setTimeout(() => {
            const qi = matchmakingQueue.indexOf(entry);
            if (qi >= 0) matchmakingQueue.splice(qi, 1);
            if (playerRoom && playerRoom.phase === 'waiting') {
              playerRoom.isBot = true;
              startGame(playerRoom);
            }
          }, QUICK_PLAY_WAIT_MS);
          matchmakingQueue.push(entry);
        }
        break;
      }

      case 'join_room': {
        if (playerRoom) return;
        const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 4) { ws.send(JSON.stringify({ type: 'error', message: 'Invalid room code' })); return; }
        const room = rooms.get(code);
        if (!room)                  { ws.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }
        if (room.clients[1])        { ws.send(JSON.stringify({ type: 'error', message: 'Room is full' })); return; }
        if (room.phase !== 'waiting') { ws.send(JSON.stringify({ type: 'error', message: 'Game already started' })); return; }
        room.clients[1] = ws;
        playerRoom = room;
        playerIdx  = 1;
        ws.send(JSON.stringify({ type: 'room_joined', code, player: 1 }));
        startGame(room);
        break;
      }

      case 'steer': {
        if (!playerRoom || playerIdx < 0 || !playerRoom.gameState) return;
        const sn = playerRoom.gameState.snakes[playerIdx];
        if (!sn || !sn.alive) return;
        const angle = parseFloat(msg.angle);
        if (isFinite(angle)) sn.targetAngle = angle;
        break;
      }

      case 'direction': {
        // Legacy 4-dir keyboard input: convert to angle for smooth movement
        if (!playerRoom || playerIdx < 0 || !playerRoom.gameState) return;
        const sn = playerRoom.gameState.snakes[playerIdx];
        if (!sn || !sn.alive) return;
        const d = msg.dir;
        if (d && (Math.abs(d.x) + Math.abs(d.y) === 1)) {
          sn.targetAngle = Math.atan2(d.y, d.x);
        }
        break;
      }

      case 'teleport': {
        if (!playerRoom || playerIdx < 0 || !playerRoom.gameState) return;
        const sn = playerRoom.gameState.snakes[playerIdx];
        if (!sn || !sn.alive || sn.teleportCharges <= 0) return;
        sn.teleportCharges--;
        const DIST = 5;
        const dx   = Math.cos(sn.angle) * DIST;
        const dy   = Math.sin(sn.angle) * DIST;
        sn.body = sn.body.map(seg => ({
          x: ((seg.x + dx) % COLS + COLS) % COLS,
          y: ((seg.y + dy) % ROWS + ROWS) % ROWS,
        }));
        break;
      }

      case 'rematch': {
        if (!playerRoom || playerRoom.phase !== 'over') return;
        if (playerRoom.isBot) {
          // Bot game — restart immediately without needing a second vote
          startGame(playerRoom);
        } else {
          playerRoom.rematchVotes++;
          if (playerRoom.rematchVotes >= 2) {
            startGame(playerRoom);
          } else {
            sendTo(playerRoom, 1 - playerIdx, { type: 'rematch_requested' });
          }
        }
        break;
      }

      case 'sp_register': {
        // Register this connection as an observable singleplayer session
        if (playerRoom || ws._spSessionId) return; // already in use
        const spName = String(msg.name || 'Anonymous').slice(0, 30);
        const sessionId = crypto.randomBytes(8).toString('hex');
        spSessions.set(sessionId, { ws, playerName: spName, startTime: Date.now(), lastSnapshot: null });
        ws._spSessionId = sessionId;
        ws.send(JSON.stringify({ type: 'sp_registered', sessionId }));
        break;
      }

      case 'sp_state_update': {
        // Store a game state snapshot sent by the player for admin spectating
        if (!ws._spSessionId) return;
        const sess = spSessions.get(ws._spSessionId);
        if (sess && msg.snapshot && typeof msg.snapshot === 'object') {
          sess.lastSnapshot = msg.snapshot;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    // Clean up singleplayer session if registered
    if (ws._spSessionId) {
      spSessions.delete(ws._spSessionId);
      ws._spSessionId = null;
    }
    if (!playerRoom) return;
    // Remove from matchmaking queue if this player was still waiting for a PvP match
    const qi = matchmakingQueue.findIndex(e => e.room === playerRoom);
    if (qi >= 0) {
      clearTimeout(matchmakingQueue[qi].botTimeout);
      matchmakingQueue.splice(qi, 1);
    }
    broadcast(playerRoom, { type: 'player_disconnected', player: playerIdx });
    closeRoom(playerRoom);
    playerRoom = null;
  });

  ws.on('error', () => { /* ignore */ });
});

// ── Start ─────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
initDb()
  .then(() => httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`VIPER.exe server → http://localhost:${PORT}`);
  }))
  .catch(err => {
    console.error('Failed to initialise database:', err.message);
    process.exit(1);
  });
