// ─────────────────────────────────────────────
//  SNAKE ROGUELIKE — game.js
// ─────────────────────────────────────────────

const GRID = 20;          // cell size in pixels
const COLS = 30;
const ROWS = 30;
const W = COLS * GRID;
const H = ROWS * GRID;

const ONLINE_COLS    = 40;
const ONLINE_ROWS    = 40;
const ONLINE_GRID    = 15;
const ONLINE_TICK_MS = 120;

// ── Smooth-snake physics ─────────────────────
const SEG_SPACING      = 0.45;  // grid-cells between body segment points
const SNAKE_RADIUS     = 0.28;  // grid-cells half-width (rendering + collision)
const INIT_SEGS        = 10;    // initial number of body segment points
const MAX_TURN_SPD     = 4.5;   // radians per second max turn rate
const APPLE_EAT_DIST   = 0.55;  // grid-cells pickup radius
const ENEMY_HIT_DIST   = 0.50;  // grid-cells enemy-head collision radius
const ENEMY_BODY_DIST  = 0.42;  // grid-cells enemy-body collision radius
const SELF_HIT_SKIP    = 8;     // skip this many segs near head for self-collision
const ENEMY_SPAWN_MS   = 14000; // base ms between enemy spawns
const MOUSE_MIN_DIST_SQ = 1;    // min squared grid-cell distance before changing online dir
const MOVEMENT_DELAY_MS = 5000; // ms to hold snake still at game start until player input

// ── Upgrade definitions ─────────────────────
const UPGRADES = [
  {
    id: 'speed_up',
    name: 'OVERDRIVE',
    icon: '⚡',
    desc: 'Move faster. Stack for ludicrous speed.',
    apply(state) { state.baseInterval = Math.max(80, state.baseInterval - 12); }
  },
  {
    id: 'speed_down',
    name: 'SLOW TIME',
    icon: '🕰️',
    desc: 'Slow movement — more time to react.',
    apply(state) { state.baseInterval = Math.min(250, state.baseInterval + 20); }
  },
  {
    id: 'ghost',
    name: 'PHASE WALK',
    icon: '👻',
    desc: 'Phase through yourself and walls. No death on self-collision.',
    apply(state) { state.ghost = (state.ghost || 0) + 1; }
  },
  {
    id: 'shield',
    name: 'WARD',
    icon: '🛡️',
    desc: 'Survive one fatal hit. Stacks infinitely.',
    apply(state) { state.shields = (state.shields || 0) + 1; }
  },
  {
    id: 'magnet',
    name: 'GRAVITY',
    icon: '🧲',
    desc: 'Apple snaps one step closer each tick.',
    apply(state) { state.magnet = (state.magnet || 0) + 1; }
  },
  {
    id: 'multi_apple',
    name: 'BOUNTY',
    icon: '🍎',
    desc: 'Spawn an extra apple on the field.',
    apply(state) {
      state.extraApples = (state.extraApples || 0) + 1;
      spawnApple(state);
    }
  },
  {
    id: 'freeze',
    name: 'ICEFIELD',
    icon: '❄️',
    desc: 'All enemies slowed. Stacks.',
    apply(state) { state.freeze = (state.freeze || 0) + 1; }
  },
  {
    id: 'score_multi',
    name: 'JACKPOT',
    icon: '💰',
    desc: '+1 bonus score per apple. Stacks.',
    apply(state) { state.scoreMult = (state.scoreMult || 1) + 1; }
  },
  {
    id: 'enemy_repel',
    name: 'REPULSE',
    icon: '💥',
    desc: 'Enemies briefly scatter on spawn.',
    apply(state) { state.repel = (state.repel || 0) + 1; }
  },
  {
    id: 'tail_sweep',
    name: 'WHIPLASH',
    icon: '🌀',
    desc: 'Tail kills enemies on contact.',
    apply(state) { state.tailSweep = (state.tailSweep || 0) + 1; }
  },
  {
    id: 'pulse',
    name: 'PULSE',
    icon: '💫',
    desc: 'Destroy enemies near apple on pickup. Stack grows the blast radius.',
    apply(state) { state.pulse = (state.pulse || 0) + 1; }
  },
  {
    id: 'lifesteal',
    name: 'LIFESTEAL',
    icon: '🩸',
    desc: 'Gain a shield charge each time you kill an enemy. Stack for more charges.',
    apply(state) { state.lifesteal = (state.lifesteal || 0) + 1; }
  },
  {
    id: 'hunter',
    name: 'HUNTER',
    icon: '🎯',
    desc: '+3 bonus score per enemy killed. Stack for ever-higher bounties.',
    apply(state) { state.hunterBonus = (state.hunterBonus || 0) + 3; }
  },
];

// ── Helpers ──────────────────────────────────
function randInt(n) { return Math.floor(Math.random() * n); }

function normalizeAngle(a) {
  while (a > Math.PI)  a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Return shortest signed difference from b to a on a wrapping axis of given size.
// e.g. wrappedDiff(29.9, 0.1, 30) → -0.2  (29.9 is 0.2 "behind" 0.1 after wrap)
function wrappedDiff(a, b, size) {
  let d = a - b;
  if (d > size / 2)  d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function isNightmareUnlocked() {
  try { return localStorage.getItem('nightmare_unlocked') === '1'; } catch (_) { return false; }
}

function setNightmareUnlocked() {
  try { localStorage.setItem('nightmare_unlocked', '1'); } catch (_) {}
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n) {
  return shuffle(arr).slice(0, n);
}

function emptyCell(state) {
  const occupied = new Set([
    ...state.snake.map(s => `${Math.round(s.x)},${Math.round(s.y)}`),
    ...state.apples.map(a => `${a.x},${a.y}`),
    ...state.enemies.map(e => `${Math.round(e.x)},${Math.round(e.y)}`),
  ]);
  let cell;
  let attempts = 0;
  do {
    cell = { x: randInt(COLS), y: randInt(ROWS) };
    attempts++;
  } while (occupied.has(`${cell.x},${cell.y}`) && attempts < 400);
  return cell;
}

function spawnApple(state) {
  const cell = emptyCell(state);
  state.apples.push({ x: cell.x, y: cell.y, fx: cell.x, fy: cell.y });
}

function pickUpgrades(state) {
  // Weight upgrades so ones we already have appear less often
  const weighted = UPGRADES.map(u => ({
    upgrade: u,
    weight: 1 / (1 + (state.upgradeCount[u.id] || 0) * 0.3)
  }));
  const pool = [];
  weighted.forEach(({ upgrade, weight }) => {
    const times = Math.max(1, Math.round(weight * 10));
    for (let i = 0; i < times; i++) pool.push(upgrade);
  });
  const seen = new Set();
  const choices = [];
  const shuffled = shuffle(pool);
  for (const u of shuffled) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      choices.push(u);
    }
    if (choices.length === 3) break;
  }
  // Fill to 3 if needed
  for (const u of UPGRADES) {
    if (choices.length >= 3) break;
    if (!seen.has(u.id)) { seen.add(u.id); choices.push(u); }
  }
  return choices;
}

// ── Enemy types ──────────────────────────────
const ENEMY_TYPES = {
  chaser: {
    color: '#e04040',
    glowColor: 'rgba(220,60,60,0.4)',
    size: 0.7,
    speed: 0.001286,  // grid-cells per ms
    score: 5,
    label: 'CHASER',
    update(e, state, dt) {
      const head = state.snake[0];
      const dx = head.x - e.x;
      const dy = head.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += (dx / len) * spd;
      e.y += (dy / len) * spd;
    }
  },
  patrol: {
    color: '#c07020',
    glowColor: 'rgba(200,120,30,0.4)',
    size: 0.65,
    speed: 0.001572,  // grid-cells per ms
    score: 8,
    label: 'PATROLLER',
    init(e) {
      e.angle = Math.random() * Math.PI * 2;
      e.turnTimer = 0;
    },
    update(e, state, dt) {
      e.turnTimer = (e.turnTimer || 0) + dt;
      if (e.turnTimer > 5600 + randInt(5600)) {
        e.angle += (Math.random() - 0.5) * Math.PI;
        e.turnTimer = 0;
      }
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += Math.cos(e.angle) * spd;
      e.y += Math.sin(e.angle) * spd;
      // Bounce off walls
      if (e.x < 0 || e.x >= COLS) { e.angle = Math.PI - e.angle; e.x = Math.max(0, Math.min(COLS - 1, e.x)); }
      if (e.y < 0 || e.y >= ROWS) { e.angle = -e.angle; e.y = Math.max(0, Math.min(ROWS - 1, e.y)); }
    }
  },
  interceptor: {
    color: '#8040c0',
    glowColor: 'rgba(140,60,210,0.4)',
    size: 0.6,
    speed: 0.001858,  // grid-cells per ms
    score: 12,
    label: 'INTERCEPTOR',
    update(e, state, dt) {
      // Predict where the snake head will be ~8 cells ahead
      const head = state.snake[0];
      const angle = state.snakeAngle || 0;
      const predict = { x: head.x + Math.cos(angle) * 8, y: head.y + Math.sin(angle) * 8 };
      const dx = predict.x - e.x;
      const dy = predict.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += (dx / len) * spd;
      e.y += (dy / len) * spd;
    }
  },
  blocker: {
    color: '#404040',
    glowColor: 'rgba(80,80,80,0.4)',
    size: 0.8,
    speed: 0,
    score: 15,
    label: 'BLOCKER',
    init(e, state) {
      // Place near an apple
      if (state.apples.length > 0) {
        const apple = state.apples[randInt(state.apples.length)];
        e.x = apple.x + (Math.random() - 0.5) * 4;
        e.y = apple.y + (Math.random() - 0.5) * 4;
        e.x = Math.max(1, Math.min(COLS - 2, e.x));
        e.y = Math.max(1, Math.min(ROWS - 2, e.y));
      }
    },
    update() {} // Static
  }
};

function spawnEnemy(state) {
  const score = state.score;
  let typeKeys = ['chaser'];
  if (score >= 15 || state.nightmareMode) typeKeys.push('patrol');
  if (score >= 30 || state.nightmareMode) typeKeys.push('interceptor');
  if (score >= 50 || state.nightmareMode) typeKeys.push('blocker');

  const typeKey = typeKeys[randInt(typeKeys.length)];
  const type = ENEMY_TYPES[typeKey];

  // Spawn at edge, away from snake head
  const head = state.snake[0];
  let pos;
  let attempts = 0;
  do {
    const edge = randInt(4);
    if (edge === 0) pos = { x: randInt(COLS), y: 0 };
    else if (edge === 1) pos = { x: randInt(COLS), y: ROWS - 1 };
    else if (edge === 2) pos = { x: 0, y: randInt(ROWS) };
    else pos = { x: COLS - 1, y: randInt(ROWS) };
    attempts++;
  } while (Math.abs(pos.x - head.x) + Math.abs(pos.y - head.y) < 8 && attempts < 50);

  const enemy = {
    x: pos.x, y: pos.y,
    type: typeKey,
    speed: type.speed * (1 + score / 120) * (state.nightmareMode ? 5.0 : 2.5),
    hp: 1,
    id: Math.random(),
  };

  if (type.init) type.init(enemy, state);

  // Apply repel scatter
  if (state.repel && state.repel > 0) {
    enemy.x += (Math.random() - 0.5) * state.repel * 3;
    enemy.y += (Math.random() - 0.5) * state.repel * 3;
    enemy.x = Math.max(0, Math.min(COLS - 1, enemy.x));
    enemy.y = Math.max(0, Math.min(ROWS - 1, enemy.y));
  }

  state.enemies.push(enemy);
}

// ── Rendering helpers ─────────────────────────
function drawGrid(ctx, cols = COLS, rows = ROWS, grid = GRID) {
  const gW = cols * grid;
  const gH = rows * grid;
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * grid, 0); ctx.lineTo(x * grid, gH); ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * grid); ctx.lineTo(gW, y * grid); ctx.stroke();
  }
}

function drawSnake(ctx, state) {
  const snake = state.snake;
  if (snake.length < 2) return;

  const isWhiplash = state.tailSweep > 0;
  const bodyColor  = isWhiplash ? '#64dcff' : '#28a050';
  const headColor  = (state.shields > 0) ? '#66b8ff' : '#50e678';
  const glowColor  = (state.shields > 0) ? '#4af'     : '#4f8';

  // Draw body as a smooth thick rounded path
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = SNAKE_RADIUS * 2 * GRID;

  // Gradient opacity: head bright, tail fades
  for (let i = snake.length - 2; i >= 0; i--) {
    const a = snake[i], b = snake[i + 1];
    // Skip segments that span a wrap boundary (avoids diagonal glitch line)
    if (Math.abs(a.x - b.x) > COLS / 2 || Math.abs(a.y - b.y) > ROWS / 2) continue;
    const alpha = 0.35 + 0.65 * (1 - i / snake.length);
    ctx.strokeStyle = isWhiplash
      ? `rgba(100, 220, 255, ${alpha})`
      : `rgba(40, 160, 80, ${alpha})`;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.moveTo(a.x * GRID + GRID / 2, a.y * GRID + GRID / 2);
    ctx.lineTo(b.x * GRID + GRID / 2, b.y * GRID + GRID / 2);
    ctx.stroke();
  }

  // Head circle
  const hx = snake[0].x * GRID + GRID / 2;
  const hy = snake[0].y * GRID + GRID / 2;
  const hr = SNAKE_RADIUS * GRID * 1.25;
  ctx.shadowBlur  = 14;
  ctx.shadowColor = glowColor;
  ctx.fillStyle   = headColor;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Eyes
  const eyeR    = hr * 0.32;
  const eyeDist = hr * 0.55;
  const ang     = state.snakeAngle || 0;
  ctx.fillStyle = '#0a0a14';
  [ang - Math.PI / 2, ang + Math.PI / 2].forEach(pa => {
    ctx.beginPath();
    ctx.arc(
      hx + Math.cos(pa) * eyeDist,
      hy + Math.sin(pa) * eyeDist,
      eyeR, 0, Math.PI * 2
    );
    ctx.fill();
  });

  ctx.restore();
}

function drawApples(ctx, state, tick, grid = GRID) {
  for (const apple of state.apples) {
    const ax = apple.fx !== undefined ? apple.fx : apple.x;
    const ay = apple.fy !== undefined ? apple.fy : apple.y;
    const pulse = 0.85 + 0.15 * Math.sin(tick * 0.08);
    const r = grid * 0.38 * pulse;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#f64';
    ctx.fillStyle = '#e84';
    ctx.beginPath();
    ctx.arc(ax * grid + grid / 2, ay * grid + grid / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawTeleportPerks(ctx, teleportPerks, tick, grid = GRID) {
  for (const tp of teleportPerks) {
    const pulse = 0.8 + 0.2 * Math.sin(tick * 0.1 + 1.5);
    const r = grid * 0.38 * pulse;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#0af';
    ctx.fillStyle = '#0cf';
    ctx.beginPath();
    ctx.arc(tp.x * grid + grid / 2, tp.y * grid + grid / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner cross to distinguish from apple
    ctx.strokeStyle = 'rgba(0,30,60,0.7)';
    ctx.lineWidth = grid * 0.1;
    const cx = tp.x * grid + grid / 2;
    const cy = tp.y * grid + grid / 2;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx + r * 0.5, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
  }
}

function drawEnemies(ctx, state, tick) {
  for (const e of state.enemies) {
    const type = ENEMY_TYPES[e.type];
    const bounce = Math.sin(tick * 0.12 + e.id * 10) * 1.5;
    const cx = e.x * GRID + GRID / 2;
    const cy = e.y * GRID + GRID / 2 + bounce;
    const r = GRID * type.size * 0.45;

    ctx.shadowBlur = 16;
    ctx.shadowColor = type.glowColor;
    ctx.fillStyle = type.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // "eye" dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawParticles(ctx, particles) {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function spawnParticles(particles, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x * GRID + GRID / 2 + (Math.random() - 0.5) * GRID,
      y: y * GRID + GRID / 2 + (Math.random() - 0.5) * GRID,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      life: 1,
      maxLife: 1,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

// ── Online mode helpers ───────────────────────
const WS_SERVER = (() => {
  if (typeof location === 'undefined' || location.protocol === 'file:') {
    return 'wss://doxnaf-online.onrender.com';
  }
  // Use local server when developing locally
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `ws://${location.host}`;
  }
  // Always connect to the Render WebSocket server in production
  return 'wss://doxnaf-online.onrender.com';
})();

function drawOnlineSnake(ctx, body, playerIdx, prevBody, t, grid = GRID) {
  if (body.length < 2) return;

  // Interpolate segment positions between server ticks
  const pts = body.map((s, i) => {
    const p = prevBody && i < prevBody.length ? prevBody[i] : s;
    let rx, ry;
    if (Math.abs(s.x - p.x) <= 1 && Math.abs(s.y - p.y) <= 1) {
      rx = p.x + (s.x - p.x) * t;
      ry = p.y + (s.y - p.y) * t;
    } else {
      rx = s.x; ry = s.y;
    }
    return { x: rx, y: ry };
  });

  const isP1      = playerIdx === 0;
  const headColor = isP1 ? '#50e678'              : '#ff8040';
  const glowColor = isP1 ? '#4f8'                 : '#f84';
  const snakeR    = 0.28; // same ratio as single-player SNAKE_RADIUS

  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = snakeR * 2 * grid;

  // Draw body as smooth rounded path with bezier curves for smooth corners
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.x - b.x) > ONLINE_COLS / 2 || Math.abs(a.y - b.y) > ONLINE_ROWS / 2) continue;
    const alpha = 0.35 + 0.65 * (1 - i / pts.length);
    ctx.strokeStyle = isP1
      ? `rgba(40, 160, 80, ${alpha})`
      : `rgba(180, 80, 20, ${alpha})`;
    ctx.shadowBlur = 0;

    // Midpoint bezier: curve from midpoint(a,b) through a to midpoint(a,c)
    // This rounds corners where the snake turns, matching the SP smooth feel
    const midAbX = (a.x + b.x) / 2 * grid + grid / 2;
    const midAbY = (a.y + b.y) / 2 * grid + grid / 2;
    let midAcX, midAcY;
    if (i > 0) {
      const c = pts[i - 1];
      if (Math.abs(a.x - c.x) <= ONLINE_COLS / 2 && Math.abs(a.y - c.y) <= ONLINE_ROWS / 2) {
        midAcX = (a.x + c.x) / 2 * grid + grid / 2;
        midAcY = (a.y + c.y) / 2 * grid + grid / 2;
      } else {
        midAcX = a.x * grid + grid / 2;
        midAcY = a.y * grid + grid / 2;
      }
    } else {
      midAcX = a.x * grid + grid / 2;
      midAcY = a.y * grid + grid / 2;
    }

    ctx.beginPath();
    ctx.moveTo(midAbX, midAbY);
    ctx.quadraticCurveTo(a.x * grid + grid / 2, a.y * grid + grid / 2, midAcX, midAcY);
    ctx.stroke();
  }

  // Head circle with glow
  const hx = pts[0].x * grid + grid / 2;
  const hy = pts[0].y * grid + grid / 2;
  const hr = snakeR * grid * 1.25;
  ctx.shadowBlur  = 14;
  ctx.shadowColor = glowColor;
  ctx.fillStyle   = headColor;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Eyes — derive direction from head vs second segment
  const eyeR    = hr * 0.32;
  const eyeDist = hr * 0.55;
  const ang     = pts.length > 1
    ? Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x)
    : 0;
  ctx.fillStyle = '#0a0a14';
  [ang - Math.PI / 2, ang + Math.PI / 2].forEach(pa => {
    ctx.beginPath();
    ctx.arc(
      hx + Math.cos(pa) * eyeDist,
      hy + Math.sin(pa) * eyeDist,
      eyeR, 0, Math.PI * 2
    );
    ctx.fill();
  });

  ctx.restore();
}

// ── Main Game Class ───────────────────────────
class SnakeRogue {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = W;
    this.canvas.height = H;

    this.state = null;
    this.phase = 'start'; // 'start'|'playing'|'upgrade'|'gameover'|'online_lobby'|'online_playing'|'online_over'
    this.pendingUpgrades = [];
    this.tick = 0;
    this.particles = [];
    this.lastMoveTime = 0;
    this.flashTimer = 0;

    this.online         = null;  // WebSocket connection
    this.onlineRole     = null;  // 0 = P1 (green), 1 = P2 (orange)
    this.onlineRoomCode = null;
    this.onlineState    = null;  // Latest game state from server
    this.prevOnlineState = null; // Previous game state for interpolation
    this.lastOnlineTick  = 0;   // Timestamp of last received tick

    // ── Lore / horror state ──────────────────
    this.gameStartTime       = 0;
    this.loreNextFlickerTime = 0;
    this.loreFlickerEndTime  = 0;
    this.loreEventActive     = false;
    this.loreEventStart      = 0;
    this._audioCtx           = null;

    // ── Mouse / joystick input state ──────────
    this._mouseGridX       = COLS / 2 + 2;
    this._mouseGridY       = ROWS / 2;
    this._mouseOnlineGridX = ONLINE_COLS / 2;
    this._mouseOnlineGridY = ONLINE_ROWS / 2;
    this._mouseActive      = false;
    this._lastSentDir      = null;
    this._joystickAngle    = 0;
    this._joystickHasInput = false;
    this._lastFrameTime    = 0;

    this._keys = {};
    this._setupInput();
    this._loop = this._gameLoop.bind(this);
    requestAnimationFrame(this._loop);

    this._renderOverlay();
  }

  _setupInput() {
    document.addEventListener('keydown', e => {
      this._keys[e.key] = true;

      // Online keyboard control — convert to angle for smooth steering
      if (this.phase === 'online_playing' && this.online && this.online.readyState === WebSocket.OPEN) {
        const angleMap = {
          ArrowUp: -Math.PI / 2, w: -Math.PI / 2, W: -Math.PI / 2,
          ArrowDown: Math.PI / 2, s: Math.PI / 2, S: Math.PI / 2,
          ArrowLeft: Math.PI, a: Math.PI, A: Math.PI,
          ArrowRight: 0, d: 0, D: 0,
        };
        const angle = angleMap[e.key];
        if (angle !== undefined) this.online.send(JSON.stringify({ type: 'steer', angle }));
        if (e.key === 'q' || e.key === 'Q') {
          this.online.send(JSON.stringify({ type: 'teleport' }));
        }
      }

      if (this.phase === 'start' && e.key === 'Enter') this._startGame();
      if (this.phase === 'gameover' && e.key === 'Enter') this._startGame();
      if (this.phase === 'gameover' && e.key === 'r') this._startGame();
    });

    // ── Mouse steering (desktop) ─────────────────
    // Use document so mouse position is tracked even outside the canvas/map
    document.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this._mouseGridX       = (e.clientX - rect.left) * (COLS       / rect.width);
      this._mouseGridY       = (e.clientY - rect.top)  * (ROWS       / rect.height);
      this._mouseOnlineGridX = (e.clientX - rect.left) * (ONLINE_COLS / rect.width);
      this._mouseOnlineGridY = (e.clientY - rect.top)  * (ONLINE_ROWS / rect.height);
      this._mouseActive = true;
      if (this.phase === 'playing') this._inputReceived = true;
    });

    this.canvas.addEventListener('click', () => {
      if (this.phase === 'start' || this.phase === 'gameover') this._startGame();
    });

    // ── Virtual joystick (mobile) ─────────────────
    const joystickArea = document.getElementById('joystick-area');
    const joystickKnob = document.getElementById('joystick-knob');
    const JMAX = 42; // max knob displacement px

    const updateKnob = (dx, dy) => {
      if (!joystickKnob) return;
      const len = Math.sqrt(dx * dx + dy * dy);
      const cx  = len > 0 ? dx / len * Math.min(JMAX, len) : 0;
      const cy  = len > 0 ? dy / len * Math.min(JMAX, len) : 0;
      joystickKnob.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
    };

    if (joystickArea) {
      joystickArea.addEventListener('touchstart', e => {
        e.preventDefault();
        if (this.phase === 'start' || this.phase === 'gameover') { this._startGame(); return; }
        const t0 = e.touches[0];
        this._joystickOriginX = t0.clientX;
        this._joystickOriginY = t0.clientY;
        updateKnob(0, 0);
      }, { passive: false });

      joystickArea.addEventListener('touchmove', e => {
        e.preventDefault();
        const dx = e.touches[0].clientX - (this._joystickOriginX || 0);
        const dy = e.touches[0].clientY - (this._joystickOriginY || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8) {
          this._joystickAngle    = Math.atan2(dy, dx);
          this._joystickHasInput = true;
          this._inputReceived    = true;
          updateKnob(dx, dy);
          // Map to steer angle for online mode
          if (this.phase === 'online_playing') {
            this._applySteer(this._joystickAngle);
          }
        }
      }, { passive: false });

      joystickArea.addEventListener('touchend', e => {
        e.preventDefault();
        this._joystickHasInput = false;
        updateKnob(0, 0);
      }, { passive: false });
    }

    // Tap canvas to start/restart on mobile
    this.canvas.addEventListener('touchstart', e => {
      if (this.phase === 'start' || this.phase === 'gameover') {
        e.preventDefault();
        this._startGame();
      }
    }, { passive: false });
  }

  _angle4Dir(angle) {
    const p = Math.PI;
    if (angle > -p / 4 && angle <= p / 4)   return { x:  1, y:  0 };
    if (angle > p / 4  && angle <= 3 * p / 4) return { x:  0, y:  1 };
    if (angle > -3 * p / 4 && angle <= -p / 4) return { x:  0, y: -1 };
    return { x: -1, y: 0 };
  }

  _applySteer(angle) {
    if (this.phase === 'online_playing' && this.online && this.online.readyState === WebSocket.OPEN) {
      this.online.send(JSON.stringify({ type: 'steer', angle }));
    }
  }

  // Send steering angle toward mouse when in online mode (called every animation frame)
  _sendMouseDirection() {
    if (this.phase !== 'online_playing') return;
    if (!this._mouseActive || !this.online || this.online.readyState !== WebSocket.OPEN) return;
    if (!this.onlineState) return;
    const sn = this.onlineState.snakes[this.onlineRole];
    if (!sn || !sn.alive || !sn.body.length) return;
    const head = sn.body[0];
    const dx = this._mouseOnlineGridX - head.x;
    const dy = this._mouseOnlineGridY - head.y;
    if (dx * dx + dy * dy < MOUSE_MIN_DIST_SQ) return;
    const angle = Math.atan2(dy, dx);
    if (this._lastSentAngle !== undefined &&
        Math.abs(normalizeAngle(angle - this._lastSentAngle)) < 0.05) return;
    this._lastSentAngle = angle;
    this._applySteer(angle);
  }

  _startGame() {
    this.particles = [];
    this.tick = 0;
    this.lastMoveTime = 0;
    this.flashTimer = 0;
    this._lastFrameTime = 0;
    this._lastUpdateTimestamp = 0;
    this._inputReceived = false;
    document.getElementById('app').classList.remove('nightmare-mode');

    const now = performance.now();
    this.gameStartTime       = now;
    this.loreNextFlickerTime = now + 10000 + Math.random() * 15000;
    this.loreFlickerEndTime  = 0;
    this.loreEventActive     = false;
    this.loreEventStart      = 0;

    // Build initial smooth snake: INIT_SEGS points spaced SEG_SPACING apart, heading right
    const initSnake = [];
    for (let i = 0; i < INIT_SEGS; i++) {
      initSnake.push({ x: 10 - i * SEG_SPACING, y: 15 });
    }

    this.state = {
      snake: initSnake,
      snakeAngle: 0,       // current heading (radians, 0 = right)
      targetAngle: 0,      // desired heading set by mouse/joystick
      direction: { x: 1, y: 0 }, // kept for online / interceptor compat
      apples: [],
      enemies: [],
      score: 0,
      applesEaten: 0,
      baseInterval: 140,
      growBuffer: 0,
      growPerApple: 2,
      shields: 0,
      ghost: 0,
      magnet: 0,
      extraApples: 0,
      freeze: 0,
      scoreMult: 1,
      repel: 0,
      tailSweep: 0,
      pulse: 0,
      lifesteal: 0,
      hunterBonus: 0,
      upgradeCount: {},
      enemySpawnTimer: 0,
      applesForNextUpgrade: 1,
      applesEatenSinceUpgrade: 0,
      nightmareMode: false,
      pulseEffects: [],
    };

    // Initial apples
    spawnApple(this.state);
    spawnApple(this.state);

    this.phase = 'playing';
    this._hideOverlay();
    this._hideUpgradePanel();
    this._updateHUD();
  }

  _startNightmareMode() {
    this._startGame();
    this.state.nightmareMode = true;
    document.getElementById('app').classList.add('nightmare-mode');
  }

  _playNightmareJumpscare() {
    this.phase = 'nightmare_jumpscare';
    this.nightmareJumpscareStart = performance.now();
    document.getElementById('app').classList.remove('nightmare-mode');
    this._playScreech();
    setTimeout(() => {
      this.state = null;
      this.phase = 'start';
      this._renderOverlay();
    }, 2500);
  }

  _update(timestamp) {
    if (this.phase !== 'playing') return;
    const state = this.state;

    // Delta time (capped to avoid big jumps after tab switch)
    const dt = this._lastFrameTime > 0
      ? Math.min(50, timestamp - this._lastFrameTime)
      : 16;
    this._lastFrameTime = timestamp;
    this._lastUpdateTimestamp = timestamp;
    this.tick++;

    // ── Steer snake toward mouse / joystick ──────
    // Joystick takes priority; mouse used when joystick inactive
    let targetAngle = state.targetAngle;
    if (this._joystickHasInput) {
      targetAngle = this._joystickAngle;
    } else if (this._mouseActive) {
      const head = state.snake[0];
      const dx = this._mouseGridX - head.x;
      const dy = this._mouseGridY - head.y;
      if (dx * dx + dy * dy > 0.09) {
        targetAngle = Math.atan2(dy, dx);
      }
    }
    state.targetAngle = targetAngle;

    // Smoothly rotate heading toward target
    const diff = normalizeAngle(targetAngle - state.snakeAngle);
    const maxTurn = MAX_TURN_SPD * dt / 1000;
    state.snakeAngle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    // Keep direction vector up-to-date for online / interceptor usage
    state.direction = {
      x: Math.cos(state.snakeAngle),
      y: Math.sin(state.snakeAngle),
    };

    // ── Movement delay: snake doesn't move for first 5 seconds unless input received ──
    const canMove = this._inputReceived || (timestamp - this.gameStartTime >= MOVEMENT_DELAY_MS);
    if (!canMove) return;

    // ── Move head forward ─────────────────────────
    const speed = dt / state.baseInterval;   // fraction of 1 grid-cell to move this frame
    const head = state.snake[0];
    let nx = head.x + Math.cos(state.snakeAngle) * speed;
    let ny = head.y + Math.sin(state.snakeAngle) * speed;

    // Wall wrapping — always active (phase through walls in all modes)
    nx = ((nx % COLS) + COLS) % COLS;
    ny = ((ny % ROWS) + ROWS) % ROWS;

    // Self collision (skip segments near the head; bypassed by ghost perk)
    if (!state.ghost) {
      for (let i = SELF_HIT_SKIP; i < state.snake.length; i++) {
        const s = state.snake[i];
        const bx = s.x - nx, by = s.y - ny;
        if (bx * bx + by * by < SNAKE_RADIUS * SNAKE_RADIUS * 4) {
          if (this._checkLoreDamage(timestamp)) return;
          this._die('self');
          return;
        }
      }
    }

    // Update head position
    head.x = nx;
    head.y = ny;

    // ── Chain body: each segment follows the one ahead ──
    for (let i = 1; i < state.snake.length; i++) {
      const prev = state.snake[i - 1];
      const seg  = state.snake[i];
      // Use wrapped diff so the chain works correctly when crossing a boundary
      const dx = wrappedDiff(seg.x, prev.x, COLS);
      const dy = wrappedDiff(seg.y, prev.y, ROWS);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SEG_SPACING) {
        const f  = SEG_SPACING / dist;
        seg.x = ((prev.x + dx * f) % COLS + COLS) % COLS;
        seg.y = ((prev.y + dy * f) % ROWS + ROWS) % ROWS;
      }
    }

    // Grow: add one segment per frame until buffer depleted
    if (state.growBuffer > 0) {
      const last = state.snake[state.snake.length - 1];
      state.snake.push({ x: last.x, y: last.y });
      state.growBuffer--;
    }

    // ── Magnet: pull apples toward head ──────────
    if (state.magnet > 0) {
      for (const apple of state.apples) {
        if (apple.fx === undefined) { apple.fx = apple.x; apple.fy = apple.y; }
        const dx = nx - apple.fx;
        const dy = ny - apple.fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) {
          const pull = Math.min(1.0, state.magnet * 0.25);
          const step = Math.min(pull * dt / state.baseInterval, dist);
          const newFx = Math.max(0, Math.min(COLS - 1, apple.fx + (dx / dist) * step));
          const newFy = Math.max(0, Math.min(ROWS - 1, apple.fy + (dy / dist) * step));
          const snapX = Math.round(newFx);
          const snapY = Math.round(newFy);
          if (!state.snake.some(s => Math.round(s.x) === snapX && Math.round(s.y) === snapY)) {
            apple.fx = newFx; apple.fy = newFy;
            apple.x  = snapX; apple.y  = snapY;
          }
        }
      }
    }

    // ── Apple eating (distance-based) ────────────
    for (let i = state.apples.length - 1; i >= 0; i--) {
      const apple = state.apples[i];
      const ax = apple.fx !== undefined ? apple.fx : apple.x;
      const ay = apple.fy !== undefined ? apple.fy : apple.y;
      const dx = ax - nx, dy = ay - ny;
      if (dx * dx + dy * dy < APPLE_EAT_DIST * APPLE_EAT_DIST) {
        state.apples.splice(i, 1);
        state.score += state.scoreMult;
        state.applesEaten++;
        // Convert grid-cell growth to segment count (SEG_SPACING cells per segment)
        state.growBuffer += Math.max(1, Math.round(state.growPerApple / SEG_SPACING));
        spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#e84', 12);

        // PULSE: blast nearby enemies
        if (state.pulse > 0) {
          const pulseRadius = state.pulse * 2;
          state.pulseEffects.push({ x: ax, y: ay, r: 0, maxR: pulseRadius, life: 1 });
          for (let j = state.enemies.length - 1; j >= 0; j--) {
            const e = state.enemies[j];
            const ex = e.x - ax, ey = e.y - ay;
            if (ex * ex + ey * ey <= pulseRadius * pulseRadius) {
              spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#f0f', 8);
              state.score += ENEMY_TYPES[e.type].score + (state.hunterBonus || 0);
              if (state.lifesteal > 0) state.shields += state.lifesteal;
              state.enemies.splice(j, 1);
            }
          }
        }

        spawnApple(state);
        for (let j = 0; j < state.extraApples; j++) spawnApple(state);

        if (!state.nightmareMode) {
          state.applesEatenSinceUpgrade++;
          if (state.applesEatenSinceUpgrade >= state.applesForNextUpgrade) {
            state.applesEatenSinceUpgrade = 0;
            this.pendingUpgrades = pickUpgrades(state);
            this.phase = 'upgrade';
            this._showUpgradePanel();
            this._updateHUD();
            return;
          }
        }

        this._updateHUD();
        break;
      }
    }

    // ── Enemy spawning (timer in ms) ──────────────
    state.enemySpawnTimer += dt;
    const difficulty = 1 + state.score / 40;
    const spawnInterval = Math.max(
      state.nightmareMode ? 2800 : 8400,
      ENEMY_SPAWN_MS / difficulty / (state.nightmareMode ? 2 : 1)
    );
    if (state.enemySpawnTimer >= spawnInterval && state.score >= 3) {
      state.enemySpawnTimer = 0;
      spawnEnemy(state);
    }

    // ── Enemy movement (per-frame with dt) ────────
    for (const e of state.enemies) {
      ENEMY_TYPES[e.type].update(e, state, dt);
      e.x = ((e.x % COLS) + COLS) % COLS;
      e.y = ((e.y % ROWS) + ROWS) % ROWS;
    }

    // ── Enemy collision ───────────────────────────
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];

      // Head collision
      const hdx = e.x - nx, hdy = e.y - ny;
      if (hdx * hdx + hdy * hdy < ENEMY_HIT_DIST * ENEMY_HIT_DIST) {
        if (state.shields > 0) {
          state.shields--;
          spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#4af', 16);
          state.enemies.splice(i, 1);
          this.flashTimer = 20;
          if (this._checkLoreDamage(timestamp)) return;
          continue;
        }
        if (this._checkLoreDamage(timestamp)) return;
        this._die('enemy');
        return;
      }

      // Body collision (skip head segment)
      let bodyHit = false;
      let closestSeg = null;
      let closestDist2 = Infinity;
      for (let si = 1; si < state.snake.length; si++) {
        const s = state.snake[si];
        const bx = s.x - e.x, by = s.y - e.y;
        const d2 = bx * bx + by * by;
        if (d2 < ENEMY_BODY_DIST * ENEMY_BODY_DIST) {
          bodyHit = true;
          if (d2 < closestDist2) { closestDist2 = d2; closestSeg = s; }
        }
      }

      if (bodyHit && closestSeg) {
        if (state.tailSweep > 0) {
          // WHIPLASH: enemy dies on body contact
          spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#c0f', 10);
          state.score += ENEMY_TYPES[e.type].score + (state.hunterBonus || 0);
          if (state.lifesteal > 0) state.shields += state.lifesteal;
          state.enemies.splice(i, 1);
        } else {
          // Solid body: push enemy away from closest segment
          const rx = e.x - closestSeg.x;
          const ry = e.y - closestSeg.y;
          const rLen = Math.sqrt(rx * rx + ry * ry) || 1;
          const pushTo = ENEMY_BODY_DIST + 0.05;
          e.x = closestSeg.x + (rx / rLen) * pushTo;
          e.y = closestSeg.y + (ry / rLen) * pushTo;
        }
      }
    }

    this._updateHUD();
  }

  _checkLoreDamage(timestamp) {
    if (this.loreEventActive) return false;
    if (this.state && this.state.nightmareMode) return false;
    if (timestamp - this.gameStartTime < 90000) return false;
    this._triggerLoreEvent(timestamp);
    return true;
  }

  _triggerLoreEvent(timestamp) {
    this.loreEventActive = true;
    this.loreEventStart  = timestamp;
    this.phase           = 'lore_event';
    this._playScreech();
  }

  _playScreech() {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = this._audioCtx;
      const osc1  = audioCtx.createOscillator();
      const osc2  = audioCtx.createOscillator();
      const gain  = audioCtx.createGain();
      const now   = audioCtx.currentTime;

      osc1.type = 'sawtooth';
      osc2.type = 'square';

      osc1.frequency.setValueAtTime(800,  now);
      osc1.frequency.exponentialRampToValueAtTime(3200, now + 0.4);
      osc1.frequency.exponentialRampToValueAtTime(600,  now + 1.0);
      osc1.frequency.exponentialRampToValueAtTime(2800, now + 1.8);
      osc1.frequency.exponentialRampToValueAtTime(400,  now + 2.6);
      osc1.frequency.exponentialRampToValueAtTime(2000, now + 3.0);

      osc2.frequency.setValueAtTime(830,  now);
      osc2.frequency.exponentialRampToValueAtTime(3300, now + 0.4);
      osc2.frequency.exponentialRampToValueAtTime(630,  now + 1.0);
      osc2.frequency.exponentialRampToValueAtTime(2900, now + 1.8);
      osc2.frequency.exponentialRampToValueAtTime(430,  now + 2.6);
      osc2.frequency.exponentialRampToValueAtTime(2100, now + 3.0);

      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 3.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now); osc1.stop(now + 3.0);
      osc2.start(now); osc2.stop(now + 3.0);
    } catch (_e) { /* audio unavailable */ }
  }

  _showLoreEndOverlay() {
    this.phase           = 'start';
    this.state           = null;
    this.loreEventActive = false;

    // Mark nightmare as permanently unlocked
    setNightmareUnlocked();

    const el = document.getElementById('overlay');
    el.className = 'start';
    el.style.display = '';
    el.innerHTML = `
      <h1>VIPER.exe</h1>
      <div class="info">
        A roguelike snake<br>
        Eat apples → choose upgrades → survive<br>
        Enemies grow stronger with each apple
      </div>
      <div class="controls">
        Move mouse to steer · Mobile: joystick<br>
        Enemies appear at score 3+<br>
        Upgrades scale with perks collected
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" id="start-btn">SOLO [Enter]</button>
        <button class="btn btn-online" id="online-btn">⚡ ONLINE</button>
      </div>
      <button class="btn btn-lore" id="lore-red-btn">☠ NIGHTMARE</button>
    `;
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
    document.getElementById('online-btn').addEventListener('click', () => this._startOnlineMode());
    document.getElementById('lore-red-btn').addEventListener('click', () => this._startNightmareMode());
  }

  _die(reason) {
    const state = this.state;
    spawnParticles(this.particles, state.snake[0].x, state.snake[0].y, '#f44', 20);
    if (state.nightmareMode) {
      this._playNightmareJumpscare();
      return;
    }
    this.phase = 'gameover';
    this._showOverlay('gameover', reason);
  }

  _chooseUpgrade(upgrade) {
    const state = this.state;
    upgrade.apply(state);
    state.upgradeCount[upgrade.id] = (state.upgradeCount[upgrade.id] || 0) + 1;
    // Scale apples needed for next upgrade: 1 more apple needed per 3 perks collected
    const totalPerks = Object.values(state.upgradeCount).reduce((a, b) => a + b, 0);
    state.applesForNextUpgrade = 1 + Math.floor(totalPerks / 3);
    this._hideUpgradePanel();
    this.phase = 'playing';
    this._updateHUD();
  }

  _updateHUD() {
    if (!this.state) return;
    const s = this.state;

    document.getElementById('hud-lbl-apples').textContent = 'APPLES';
    document.getElementById('hud-apples').textContent     = s.applesEaten;

    // Timer
    const elapsed = Math.max(0, (this._lastUpdateTimestamp || this.gameStartTime) - this.gameStartTime);
    const secs    = Math.floor(elapsed / 1000);
    const mins    = Math.floor(secs / 60);
    document.getElementById('hud-lbl-timer').textContent = 'TIME';
    document.getElementById('hud-timer').textContent     = `${mins}:${String(secs % 60).padStart(2, '0')}`;

    // Build upgrade summary
    const parts = [];
    if (s.nightmareMode) {
      parts.push('☠ NIGHTMARE');
    } else {
      if (s.applesForNextUpgrade > 1) {
        const needed = s.applesForNextUpgrade - s.applesEatenSinceUpgrade;
        parts.push(`🍎×${needed}→perk`);
      }
      if (s.ghost) parts.push(`👻×${s.ghost}`);
      if (s.shields) parts.push(`🛡️×${s.shields}`);
      if (s.magnet) parts.push(`🧲×${s.magnet}`);
      if (s.freeze) parts.push(`❄️×${s.freeze}`);
      if (s.scoreMult > 1) parts.push(`💰×${s.scoreMult}`);
      if (s.tailSweep) parts.push(`🌀×${s.tailSweep}`);
      if (s.repel) parts.push(`💥×${s.repel}`);
      if (s.extraApples) parts.push(`🍎+${s.extraApples}`);
      if (s.pulse) parts.push(`💫×${s.pulse}`);
      if (s.lifesteal) parts.push(`🩸×${s.lifesteal}`);
      if (s.hunterBonus) parts.push(`🎯×${Math.floor(s.hunterBonus / 3)}`);
    }
    document.getElementById('hud-upgrades').textContent = parts.join('  ');
  }

  _renderFrame(timestamp) {
    const ctx = this.ctx;
    const state = this.state;

    // Background
    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(100, 200, 255, ${this.flashTimer / 40})`;
      this.flashTimer--;
    } else {
      ctx.fillStyle = '#08080f';
    }
    ctx.fillRect(0, 0, W, H);

    // ── Online multiplayer rendering ─────────
    if (this.phase === 'online_playing' && this.onlineState) {
      const gs = this.onlineState;
      const prev = this.prevOnlineState;
      const t = prev ? Math.min(1, (timestamp - this.lastOnlineTick) / ONLINE_TICK_MS) : 1;
      drawGrid(ctx, ONLINE_COLS, ONLINE_ROWS, ONLINE_GRID);
      drawApples(ctx, { apples: gs.apples }, gs.tick, ONLINE_GRID);
      if (gs.teleportPerks) drawTeleportPerks(ctx, gs.teleportPerks, gs.tick, ONLINE_GRID);
      gs.snakes.forEach((sn, idx) => {
        if (sn.body && sn.body.length > 0) {
          const prevBody = prev && prev.snakes[idx] ? prev.snakes[idx].body : null;
          drawOnlineSnake(ctx, sn.body, idx, prevBody, t, ONLINE_GRID);
        }
      });
      for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life -= 0.03; }
      this.particles = this.particles.filter(p => p.life > 0);
      drawParticles(ctx, this.particles);
      return;
    }

    // ── Nightmare jumpscare phase ─────────────
    if (this.phase === 'nightmare_jumpscare') {
      const elapsed = timestamp - this.nightmareJumpscareStart;
      const frame = Math.floor(elapsed / 80) % 2;
      ctx.fillStyle = frame === 0 ? '#cc0000' : '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = frame === 0 ? '#ffffff' : '#cc0000';
      ctx.font = `bold ${Math.floor(80 + Math.sin(elapsed * 0.05) * 10)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', W / 2, H / 2 - 50);
      ctx.font = 'bold 36px Courier New';
      ctx.fillText('YOU DIED', W / 2, H / 2 + 40);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // ── Lore event phase — aggressive flicker ─
    if (this.phase === 'lore_event') {
      drawGrid(ctx);
      if (this.state) {
        drawApples(ctx, this.state, this.tick);
        drawSnake(ctx, this.state);
        drawEnemies(ctx, this.state, this.tick);
        drawParticles(ctx, this.particles);
      }
      const elapsed = timestamp - this.loreEventStart;
      if (elapsed >= 3000) {
        this._showLoreEndOverlay();
        return;
      }
      if (Math.floor(elapsed / 50) % 2 === 0) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }

    drawGrid(ctx);

    if (!state) return;

    // Draw elements
    drawApples(ctx, state, this.tick);
    drawSnake(ctx, state);
    drawEnemies(ctx, state, this.tick);

    // Pulse rings
    if (state.pulseEffects) {
      for (const pe of state.pulseEffects) {
        ctx.save();
        ctx.strokeStyle = `rgba(220, 100, 255, ${pe.life})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#d0f';
        ctx.beginPath();
        ctx.arc(pe.x * GRID + GRID / 2, pe.y * GRID + GRID / 2, pe.r * GRID, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        pe.r += (pe.maxR - pe.r) * 0.25 + 0.2;
        pe.life -= 0.06;
      }
      state.pulseEffects = state.pulseEffects.filter(pe => pe.life > 0);
    }

    // Particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    drawParticles(ctx, this.particles);

  }

  _gameLoop(timestamp) {
    this._update(timestamp);
    this._sendMouseDirection();
    this._renderFrame(timestamp);
    requestAnimationFrame(this._loop);
  }

  // ── UI methods ──────────────────────────────
  _hideOverlay() {
    document.getElementById('overlay').style.display = 'none';
  }

  _showOverlay(type, reason) {
    const el = document.getElementById('overlay');
    el.className = type;
    el.style.display = '';

    if (type === 'gameover') {
      const s = this.state;
      const reasonText = reason === 'wall' ? 'hit a wall' : reason === 'self' ? 'bit your own tail' : 'caught by an enemy';

      // Build upgrade list
      const upgradeNames = Object.entries(s.upgradeCount)
        .map(([id, count]) => {
          const u = UPGRADES.find(u => u.id === id);
          return u ? `<span>${u.icon} ${u.name} ×${count}</span>` : '';
        })
        .filter(Boolean).join('  ');

      el.innerHTML = `
        <h1>YOU DIED</h1>
        <div class="score-display">SCORE: ${s.score} &nbsp;|&nbsp; APPLES: ${s.applesEaten}</div>
        <div class="info">You ${reasonText}.</div>
        ${upgradeNames ? `<div id="upgrades-list">${upgradeNames}</div>` : ''}
        <button class="btn" id="restart-btn">PLAY AGAIN [Enter]</button>
        <div class="controls">Mouse to steer · Mobile: joystick</div>
      `;
      document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
    }
  }

  _renderOverlay() {
    const el = document.getElementById('overlay');
    el.className = 'start';
    const nightmareUnlocked = isNightmareUnlocked();
    el.innerHTML = `
      <h1>VIPER.exe</h1>
      <div class="info">
        A roguelike snake<br>
        Eat apples → choose upgrades → survive<br>
        Enemies grow stronger with each apple
      </div>
      <div class="controls">
        Move mouse to steer · Mobile: joystick<br>
        Enemies appear at score 3+<br>
        Upgrades scale with perks collected
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" id="start-btn">SOLO [Enter]</button>
        <button class="btn btn-online" id="online-btn">⚡ ONLINE</button>
      </div>
      ${nightmareUnlocked ? '<button class="btn btn-lore" id="lore-red-btn">☠ NIGHTMARE</button>' : ''}
    `;
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
    document.getElementById('online-btn').addEventListener('click', () => this._startOnlineMode());
    const loreBtn = document.getElementById('lore-red-btn');
    if (loreBtn) loreBtn.addEventListener('click', () => this._startNightmareMode());
  }

  _hideUpgradePanel() {
    document.getElementById('upgrade-panel').style.display = 'none';
  }

  _showUpgradePanel() {
    const panel = document.getElementById('upgrade-panel');
    panel.style.display = '';

    const state = this.state;
    const cardsHtml = this.pendingUpgrades.map((u, i) => {
      const stackCount = state.upgradeCount[u.id] || 0;
      const stackText = stackCount > 0 ? `<div class="stack">Already have ×${stackCount}</div>` : '';
      return `
        <div class="upgrade-card" data-idx="${i}">
          <div class="icon">${u.icon}</div>
          <div class="name">${u.name}</div>
          <div class="desc">${u.desc}</div>
          ${stackText}
        </div>`;
    }).join('');

    panel.innerHTML = `
      <h2>UPGRADE</h2>
      <div class="subtitle">Choose one power-up</div>
      <div class="upgrade-cards">${cardsHtml}</div>
      <div class="info" style="font-size:11px;color:#345">Click a card or press 1 / 2 / 3</div>
    `;

    panel.querySelectorAll('.upgrade-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        this._chooseUpgrade(this.pendingUpgrades[idx]);
      });
    });

    // Keyboard shortcuts
    const keyHandler = (e) => {
      const map = { '1': 0, '2': 1, '3': 2 };
      if (map[e.key] !== undefined && map[e.key] < this.pendingUpgrades.length) {
        document.removeEventListener('keydown', keyHandler);
        this._chooseUpgrade(this.pendingUpgrades[map[e.key]]);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  // ── Online mode ──────────────────────────────
  _startOnlineMode() {
    this.phase = 'online_lobby';
    this._showOnlineLobby();
  }

  _showOnlineLobby() {
    const el = document.getElementById('overlay');
    el.className = 'online';
    el.style.display = '';
    el.innerHTML = `
      <h1>ONLINE</h1>
      <div class="info">Play against a friend over the internet</div>
      <button class="btn btn-online" id="create-room-btn">CREATE ROOM</button>
      <div class="online-sep">— or join existing room —</div>
      <div class="online-join-row">
        <input id="room-code-input" class="room-input" maxlength="4"
               placeholder="ABCD" autocomplete="off" spellcheck="false" />
        <button class="btn" id="join-room-btn">JOIN</button>
      </div>
      <div id="online-error" class="online-error"></div>
      <button class="btn btn-back" id="back-btn">← BACK</button>
    `;
    document.getElementById('create-room-btn').addEventListener('click', () => this._createRoom());
    document.getElementById('join-room-btn').addEventListener('click', () => {
      const code = document.getElementById('room-code-input').value.toUpperCase().trim();
      if (code.length === 4) this._joinRoom(code);
      else this._setOnlineError('Enter a 4-character room code');
    });
    document.getElementById('room-code-input').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        const code = document.getElementById('room-code-input').value.toUpperCase().trim();
        if (code.length === 4) this._joinRoom(code);
        else this._setOnlineError('Enter a 4-character room code');
      }
    });
    document.getElementById('back-btn').addEventListener('click', () => {
      this._leaveOnline();
      this._renderOverlay();
    });
  }

  _showOnlineWaiting() {
    const el = document.getElementById('overlay');
    el.className = 'online';
    el.style.display = '';
    el.innerHTML = `
      <h1>ONLINE</h1>
      <div class="info">Share this code with your opponent:</div>
      <div class="room-code-display">${this.onlineRoomCode}</div>
      <div class="info">Waiting for opponent to join…</div>
      <div id="online-error" class="online-error"></div>
      <button class="btn btn-back" id="back-btn">← BACK</button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => {
      this._leaveOnline();
      this._renderOverlay();
    });
  }

  _connectWS(onOpen) {
    this._leaveOnline();
    const ws = new WebSocket(WS_SERVER);
    this.online = ws;
    this.phase = 'online_lobby';

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._handleOnlineMsg(msg);
    });
    ws.addEventListener('close', () => {
      if (this.phase === 'online_playing') {
        this._showOnlineDisconnected();
      } else if (this.phase === 'online_lobby') {
        this._setOnlineError('Connection failed — is the server running?');
      }
    });
    ws.addEventListener('error', () => {
      this._setOnlineError('Cannot connect to server');
    });
  }

  _createRoom() {
    this._connectWS(() => {
      this.online.send(JSON.stringify({ type: 'create_room' }));
    });
  }

  _joinRoom(code) {
    this._connectWS(() => {
      this.online.send(JSON.stringify({ type: 'join_room', code }));
    });
  }

  _leaveOnline() {
    this.phase = 'start';
    if (this.online) {
      this.online.close();
      this.online = null;
    }
    this.onlineRole      = null;
    this.onlineRoomCode  = null;
    this.onlineState     = null;
    this.prevOnlineState = null;
    this.lastOnlineTick  = 0;
  }

  _setOnlineError(msg) {
    const el = document.getElementById('online-error');
    if (el) el.textContent = msg;
  }

  _handleOnlineMsg(msg) {
    switch (msg.type) {

      case 'room_created':
        this.onlineRole     = msg.player;
        this.onlineRoomCode = msg.code;
        this._showOnlineWaiting();
        break;

      case 'room_joined':
        this.onlineRole     = msg.player;
        this.onlineRoomCode = msg.code;
        // Server will send game_start imminently
        break;

      case 'game_start':
        this.onlineState     = msg.state;
        this.prevOnlineState = null;
        this.lastOnlineTick  = performance.now();
        this.particles       = [];
        this._lastSentAngle  = undefined;
        this.phase           = 'online_playing';
        this._hideOverlay();
        this._updateOnlineHUD();
        break;

      case 'game_tick':
        this.prevOnlineState = this.onlineState;
        this.onlineState     = msg.state;
        this.lastOnlineTick  = performance.now();
        this._lastSentAngle  = undefined; // re-evaluate mouse direction every tick
        this._updateOnlineHUD();
        break;

      case 'game_over':
        this.onlineState = msg.state || this.onlineState;
        this.phase       = 'online_over';
        this._showOnlineGameOver(msg.winner, msg.scores);
        break;

      case 'player_disconnected':
        this._showOnlineDisconnected();
        break;

      case 'rematch_requested': {
        const el = document.getElementById('rematch-info');
        if (el) el.textContent = 'Opponent wants a rematch!';
        break;
      }

      case 'error':
        this._setOnlineError(msg.message || 'Server error');
        break;
    }
  }

  _showOnlineGameOver(winner, scores) {
    const el = document.getElementById('overlay');
    let heading, cls;
    if (winner === -1)                   { heading = 'DRAW';        cls = 'online-draw'; }
    else if (winner === this.onlineRole) { heading = 'YOU WIN! 🏆'; cls = 'online-win';  }
    else                                 { heading = 'YOU LOSE';    cls = 'online-lose'; }
    el.className = cls;
    el.style.display = '';
    el.innerHTML = `
      <h1>${heading}</h1>
      <div class="score-display">
        🟢 P1: ${scores[0]} &nbsp;|&nbsp; 🟠 P2: ${scores[1]}
      </div>
      <div id="rematch-info" class="info"></div>
      <button class="btn btn-online" id="rematch-btn">REMATCH</button>
      <button class="btn btn-back" id="menu-btn">← MENU</button>
    `;
    document.getElementById('rematch-btn').addEventListener('click', () => {
      if (this.online && this.online.readyState === WebSocket.OPEN) {
        this.online.send(JSON.stringify({ type: 'rematch' }));
        const btn = document.getElementById('rematch-btn');
        if (btn) { btn.textContent = 'WAITING FOR OPPONENT…'; btn.disabled = true; }
      }
    });
    document.getElementById('menu-btn').addEventListener('click', () => {
      this._leaveOnline();
      this._renderOverlay();
    });
  }

  _showOnlineDisconnected() {
    this.phase = 'online_over';
    const el = document.getElementById('overlay');
    el.className = 'online-lose';
    el.style.display = '';
    el.innerHTML = `
      <h1>DISCONNECTED</h1>
      <div class="info">Your opponent left the game.</div>
      <button class="btn btn-back" id="menu-btn">← MENU</button>
    `;
    document.getElementById('menu-btn').addEventListener('click', () => {
      this._leaveOnline();
      this._renderOverlay();
    });
  }

  _updateOnlineHUD() {
    if (!this.onlineState) return;
    const gs = this.onlineState;
    document.getElementById('hud-lbl-apples').textContent = 'SCORES';
    document.getElementById('hud-apples').textContent     = `🟢 ${gs.snakes[0].score}  🟠 ${gs.snakes[1].score}`;
    document.getElementById('hud-lbl-timer').textContent  = 'ROOM';
    document.getElementById('hud-timer').textContent      = this.onlineRoomCode || '';
    const mySnake = gs.snakes[this.onlineRole];
    const charges = mySnake ? (mySnake.teleportCharges || 0) : 0;
    document.getElementById('hud-upgrades').textContent   =
      `${this.onlineRole === 0 ? '🟢' : '🟠'} YOU` + (charges > 0 ? `  ⌁×${charges} [Q]` : '');
  }
}

// ── Boot ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new SnakeRogue();
});
