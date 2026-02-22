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
  for (const sn of snakes) for (const c of sn.body) occ.add(`${c.x},${c.y}`);
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
  for (const sn of snakes) for (const c of sn.body) occ.add(`${c.x},${c.y}`);
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
      body:    [{ x: 10, y: 20 }, { x: 9, y: 20 }, { x: 8, y: 20 }],
      dir:     { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      alive:   true,
      score:   0,
      teleportCharges: 0,
    },
    {
      body:    [{ x: 30, y: 20 }, { x: 31, y: 20 }, { x: 32, y: 20 }],
      dir:     { x: -1, y: 0 },
      nextDir: { x: -1, y: 0 },
      alive:   true,
      score:   0,
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

  // 1. Apply pending directions (prevent 180° reversal)
  for (const sn of gs.snakes) {
    if (!sn.alive) continue;
    const nd = sn.nextDir, cd = sn.dir;
    if (!(nd.x === -cd.x && nd.y === -cd.y)) sn.dir = { x: nd.x, y: nd.y };
  }

  // 2. Compute new head positions (walls always wrap)
  const newHeads = gs.snakes.map(sn => {
    if (!sn.alive) return null;
    const h = sn.body[0];
    return {
      x: (h.x + sn.dir.x + COLS) % COLS,
      y: (h.y + sn.dir.y + ROWS) % ROWS,
    };
  });

  // 3. Head-to-head collision → both die simultaneously
  if (gs.snakes[0].alive && gs.snakes[1].alive &&
      newHeads[0] && newHeads[1] &&
      newHeads[0].x === newHeads[1].x && newHeads[0].y === newHeads[1].y) {
    gs.snakes[0].alive = false;
    gs.snakes[1].alive = false;
  }

  // 4. Body collisions (tail excluded — it moves away this tick)
  for (let p = 0; p < 2; p++) {
    if (!gs.snakes[p].alive) continue;
    const h   = newHeads[p];
    const opp = 1 - p;

    // Self collision
    const selfBody = gs.snakes[p].body.slice(0, -1);
    if (selfBody.some(c => c.x === h.x && c.y === h.y)) {
      gs.snakes[p].alive = false;
      continue;
    }

    // Opponent body collision
    if (gs.snakes[opp].alive) {
      const oppBody = gs.snakes[opp].body.slice(0, -1);
      if (oppBody.some(c => c.x === h.x && c.y === h.y)) {
        gs.snakes[p].alive = false;
      }
    }
  }

  // 5. Advance alive snakes and handle apple eating
  for (let p = 0; p < 2; p++) {
    if (!gs.snakes[p].alive) continue;
    const sn = gs.snakes[p];
    const h  = newHeads[p];
    sn.body.unshift(h);

    const ai = gs.apples.findIndex(a => a.x === h.x && a.y === h.y);
    if (ai !== -1) {
      gs.apples.splice(ai, 1);
      sn.score++;
      gs.apples.push(randomApple(gs.snakes, gs.apples));
      // Grow: don't pop tail this tick
    } else {
      sn.body.pop();
    }
  }

  // 6. Teleport perk collection
  for (let p = 0; p < 2; p++) {
    if (!gs.snakes[p].alive) continue;
    const h = gs.snakes[p].body[0];
    for (let i = gs.teleportPerks.length - 1; i >= 0; i--) {
      if (gs.teleportPerks[i].x === h.x && gs.teleportPerks[i].y === h.y) {
        gs.teleportPerks.splice(i, 1);
        gs.snakes[p].teleportCharges++;
        gs.teleportPerks.push(randomTeleportPerk(gs.snakes, gs.apples, gs.teleportPerks));
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

      case 'direction': {
        if (!playerRoom || playerIdx < 0 || !playerRoom.gameState) return;
        const sn = playerRoom.gameState.snakes[playerIdx];
        if (!sn || !sn.alive) return;
        const d = msg.dir;
        if (d && (d.x === 0 || d.x === 1 || d.x === -1) &&
            (d.y === 0 || d.y === 1 || d.y === -1) &&
            Math.abs(d.x) + Math.abs(d.y) === 1) {
          sn.nextDir = { x: d.x, y: d.y };
        }
        break;
      }

      case 'teleport': {
        if (!playerRoom || playerIdx < 0 || !playerRoom.gameState) return;
        const sn = playerRoom.gameState.snakes[playerIdx];
        if (!sn || !sn.alive || sn.teleportCharges <= 0) return;
        sn.teleportCharges--;
        const DIST = 5;
        sn.body = sn.body.map(seg => ({
          x: (seg.x + sn.dir.x * DIST + COLS * 2) % COLS,
          y: (seg.y + sn.dir.y * DIST + ROWS * 2) % ROWS,
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
