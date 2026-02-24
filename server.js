// ─────────────────────────────────────────────
//  VIPER.exe — Online Multiplayer Server
//  Usage: npm install && npm start
//  Then open http://localhost:3001 in two browsers
// ─────────────────────────────────────────────
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const WebSocket = require('ws');

const COLS    = 40;
const ROWS    = 40;
const TICK_MS = 120;

// ── Leaderboard ───────────────────────────────
const LEADERBOARD_FILE = path.join(process.env.DATA_DIR || __dirname, 'leaderboard.json');
const MAX_LEADERBOARD_ENTRIES = 10;
let leaderboard = [];

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

function loadLeaderboard() {
  // Ensure the data directory exists (e.g. on first run with a fresh persistent disk)
  const dir = path.dirname(LEADERBOARD_FILE);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  try {
    const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    leaderboard = JSON.parse(data);
    if (!Array.isArray(leaderboard)) leaderboard = [];
  } catch (_) {
    leaderboard = [];
  }
}

function saveLeaderboard() {
  try { fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard)); }
  catch (err) { console.error('Failed to save leaderboard:', err.message); }
}

function addLeaderboardEntry(name, score, applesEaten) {
  // Sanitize input
  let safeName = String(name || 'Anonymous').slice(0, 30).replace(/[^\x20-\x7E]/g, '').trim() || 'Anonymous';
  // Replace banned names silently with Anonymous
  if (containsBannedWord(safeName)) safeName = 'Anonymous';
  const safeScore  = Math.max(0, Math.min(1e7, Math.floor(Number(score) || 0)));
  const safeApples = Math.max(0, Math.min(1e6, Math.floor(Number(applesEaten) || 0)));
  const existing = leaderboard.find(e => e.name === safeName);
  if (existing) {
    if (safeScore <= existing.score) return; // keep the better score
    existing.score = safeScore;
    existing.applesEaten = safeApples;
    existing.date = new Date().toISOString();
  } else {
    leaderboard.push({ name: safeName, score: safeScore, applesEaten: safeApples, date: new Date().toISOString() });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);
  saveLeaderboard();
}

loadLeaderboard();

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
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ entries: leaderboard }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          addLeaderboardEntry(d.name, d.score, d.applesEaten);
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: true }));
        } catch (_) {
          res.writeHead(400); res.end('Bad Request');
        }
      });
      return;
    }
    res.writeHead(405); res.end('Method Not Allowed');
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

function startGame(room) {
  if (room.ticker) { clearInterval(room.ticker); room.ticker = null; }
  room.gameState    = createGameState();
  room.phase        = 'playing';
  room.rematchVotes = 0;

  broadcast(room, { type: 'game_start', state: room.gameState });

  room.ticker = setInterval(() => {
    if (room.phase !== 'playing') return;
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
        };
        rooms.set(code, playerRoom);
        playerIdx = 0;
        ws.send(JSON.stringify({ type: 'room_created', code, player: 0 }));
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
        playerRoom.rematchVotes++;
        if (playerRoom.rematchVotes >= 2) {
          startGame(playerRoom);
        } else {
          sendTo(playerRoom, 1 - playerIdx, { type: 'rematch_requested' });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!playerRoom) return;
    broadcast(playerRoom, { type: 'player_disconnected', player: playerIdx });
    closeRoom(playerRoom);
    playerRoom = null;
  });

  ws.on('error', () => { /* ignore */ });
});

// ── Start ─────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`VIPER.exe server → http://localhost:${PORT}`);
});
