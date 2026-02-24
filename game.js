// ─────────────────────────────────────────────
//  SNAKE ROGUELIKE — game.js
// ─────────────────────────────────────────────

// ── Apple sprites ────────────────────────────
const APPLE_IMG_RED    = new Image();
const APPLE_IMG_YELLOW = new Image();
APPLE_IMG_RED.src    = 'sprites/APPLER.png';
APPLE_IMG_YELLOW.src = 'sprites/APPLEY.png';

// ── Teleport perk sprite ──────────────────────
const TELEPORT_PERK_IMG = new Image();
TELEPORT_PERK_IMG.src = 'sprites/TELEPORTPERK.png';

const GRID = 20;          // cell size in pixels
const NIGHTMARE_COLS = 30;
const NIGHTMARE_ROWS = 30;
let VIEW_COLS = 30;
let VIEW_ROWS = 30;
let W = VIEW_COLS * GRID;
let H = VIEW_ROWS * GRID;

const ONLINE_COLS    = 40;
const ONLINE_ROWS    = 40;
const ONLINE_GRID    = 15;
const ONLINE_TICK_MS = 120;

// ── Smooth-snake physics ─────────────────────
const SEG_SPACING      = 0.45;  // grid-cells between body segment points
const SNAKE_RADIUS     = 0.28;  // grid-cells half-width (rendering + collision)
const INIT_SEGS        = 10;    // initial number of body segment points
const MAX_TURN_SPD     = 4.5;   // radians per second max turn rate
const APPLE_EAT_DIST   = 0.70;  // grid-cells pickup radius
const ENEMY_HIT_DIST   = 0.50;  // grid-cells enemy-head collision radius
const ENEMY_BODY_DIST  = 0.42;  // grid-cells enemy-body collision radius
const SELF_HIT_SKIP    = 8;     // skip this many segs near head for self-collision
const ENEMY_SPAWN_MS   = 14000; // base ms between enemy spawns
const MOUSE_MIN_DIST_SQ = 1;    // min squared grid-cell distance before changing online dir
const MOVEMENT_DELAY_MS = 5000; // ms to hold snake still at game start until player input

// ── Bullet physics ───────────────────────────
const BULLET_SPEED         = 0.016;   // grid-cells per ms
const BULLET_LIFE_MS       = 1800;    // max bullet lifespan in ms
const BULLET_SPREAD_ANGLE  = 0.22;    // radians of spread between multishot bullets
const EXPLOSIVE_ROUNDS_RADIUS = 2.5; // grid-cell blast radius for explosive rounds perk

// ── Chest timing ────────────────────────────
const CHEST_FIRST_SPAWN_MS    = 120000; // first chest spawns at 2 minutes
const CHEST_SPAWN_BASE_MS     = 120000; // 2 minute gap between chests
const CHEST_EXPIRE_MS         = 90000; // chest disappears if not collected in 90 s
const CHEST_RESPAWN_DIST      = 100;   // cells; chest repositions if player strays this far

// ── Upgrade definitions ─────────────────────
const UPGRADES = [
  // ── One-time perks (always listed first) ────
  {
    id: 'ghost',
    name: 'PHASE WALK',
    icon: '👻',
    desc: 'Phase through yourself and walls. No death on self-collision. One time only.',
    oneTime: true,
    apply(state) { state.ghost = (state.ghost || 0) + 1; }
  },
  {
    id: 'behemoth',
    name: 'BEHEMOTH',
    icon: '🐉',
    desc: 'Triple growth per apple — become enormous. One time only.',
    oneTime: true,
    apply(state) { state.growPerApple = Math.round(state.growPerApple * 3); }
  },
  {
    id: 'oracle',
    name: 'ORACLE',
    icon: '🔮',
    desc: 'Choose from 4 upgrades instead of 3. One time only.',
    oneTime: true,
    apply(state) { state.oracle = true; }
  },
  // ── Stackable perks ──────────────────────────
  {
    id: 'speed_up',
    name: 'OVERDRIVE',
    icon: '⚡',
    desc: 'Move faster. Stack for ludicrous speed.',
    apply(state) { state.baseInterval = Math.max(80, state.baseInterval - 6); }
  },
  {
    id: 'speed_down',
    name: 'SLOW TIME',
    icon: '🕰️',
    desc: 'Slow movement — more time to react.',
    apply(state) { state.baseInterval = Math.min(250, state.baseInterval + 10); }
  },
  {
    id: 'shield',
    name: 'WARD',
    icon: '🛡️',
    desc: 'Survive one fatal hit. Stacks up to 5.',
    apply(state) { state.shields = Math.min(5, (state.shields || 0) + 1); }
  },
  {
    id: 'freeze',
    name: 'ICEFIELD',
    icon: '❄️',
    desc: 'All enemies slowed. Stacks.',
    apply(state) { state.freeze = (state.freeze || 0) + 1; }
  },
  {
    id: 'enemy_repel',
    name: 'REPULSE',
    icon: '💥',
    desc: 'Enemies briefly scatter on spawn.',
    apply(state) { state.repel = (state.repel || 0) + 1; }
  },
  {
    id: 'pulse',
    name: 'PULSE',
    icon: '💫',
    desc: 'Destroy enemies near apple on pickup. Stack grows the blast radius.',
    apply(state) { state.pulse = (state.pulse || 0) + 1; }
  },
  {
    id: 'power_shot',
    name: 'POWER SHOT',
    icon: '🔥',
    desc: 'Bullets deal +1 damage per stack. Body always deals minimum damage.',
    apply(state) { state.bulletDamage = (state.bulletDamage || 2) + 1; }
  },
  // ── Pistol perks ─────────────────────────────
  {
    id: 'rapid_fire',
    name: 'RAPID FIRE',
    icon: '🔫',
    desc: 'Shoot faster. Stack to become a bullet storm.',
    apply(state) { state.shootInterval = Math.max(80, (state.shootInterval || 400) - 60); }
  },
  {
    id: 'piercing',
    name: 'PIERCING',
    icon: '🏹',
    desc: 'Bullets pass through all enemies. One time only.',
    oneTime: true,
    apply(state) { state.bulletPiercing = true; }
  },
  {
    id: 'explosive_rounds',
    name: 'EXPLOSIVE',
    icon: '💣',
    desc: 'Bullets explode on impact, damaging nearby enemies. One time only.',
    oneTime: true,
    apply(state) { state.bulletExplosive = true; }
  },
  {
    id: 'multishot',
    name: 'MULTISHOT',
    icon: '✳️',
    desc: 'Fire an extra bullet per shot in a spread. Stack for more bullets.',
    apply(state) { state.multishot = (state.multishot || 0) + 1; }
  },
  {
    id: 'magnetism',
    name: 'MAGNETISM',
    icon: '🧲',
    desc: 'Increases apple pickup radius. Stack for an even wider reach.',
    apply(state) { state.appleEatDist = (state.appleEatDist || APPLE_EAT_DIST) + 0.15; }
  },
];

// ── Name content filter (mirrors server-side list) ──
const NAME_BANNED_WORDS = [
  'nigger', 'nigga', 'faggot', 'kike', 'chink',
  'coon', 'spook', 'tranny', 'gook', 'wetback',
  'cracker', 'beaner', 'zipperhead', 'slant',
];

function nameNormalize(str) {
  return str.toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/@/g, 'a')
    .replace(/\$/g, 's').replace(/!/g, 'i').replace(/\|/g, 'i');
}

function nameContainsBannedWord(str) {
  const norm = nameNormalize(str);
  if (NAME_BANNED_WORDS.some(w => norm.includes(w))) return true;
  if (/\bfag\b/.test(norm)) return true;
  if (/spic(?![ey])/.test(norm)) return true;
  return false;
}

// ── Rare chest system ────────────────────────
const CHEST_RARITIES = [
  { id: 'common',    name: 'COMMON',    color: '#aaaaaa', glowColor: 'rgba(170,170,170,0.5)', weight: 50 },
  { id: 'uncommon',  name: 'UNCOMMON',  color: '#44dd44', glowColor: 'rgba(40,180,40,0.5)',   weight: 30 },
  { id: 'rare',      name: 'RARE',      color: '#4488ff', glowColor: 'rgba(40,80,220,0.5)',   weight: 15 },
  { id: 'epic',      name: 'EPIC',      color: '#cc44ff', glowColor: 'rgba(160,20,220,0.5)',  weight: 4  },
  { id: 'legendary', name: 'LEGENDARY', color: '#ffcc00', glowColor: 'rgba(200,140,0,0.6)',   weight: 1  },
];
const CHEST_RARITIES_TOTAL_WEIGHT = CHEST_RARITIES.reduce((sum, r) => sum + r.weight, 0);

const CHEST_ITEMS = [
  // Common
  {
    id: 'battle_hardened', rarity: 'common',
    name: 'BATTLE HARDENED', icon: '🛡️',
    desc: 'Gain 2 shield charges instantly.',
    apply(state) { state.shields = Math.min(10, (state.shields || 0) + 2); }
  },
  {
    id: 'quick_draw', rarity: 'common',
    name: 'QUICK DRAW', icon: '🔫',
    desc: 'Fire 40% faster permanently.',
    apply(state) { state.shootInterval = Math.max(80, Math.floor((state.shootInterval || 400) * 0.6)); }
  },
  // Uncommon
  {
    id: 'double_tap', rarity: 'uncommon',
    name: 'DOUBLE TAP', icon: '✳️',
    desc: '+2 multishot and faster fire rate.',
    apply(state) {
      state.multishot = (state.multishot || 0) + 2;
      state.shootInterval = Math.max(80, (state.shootInterval || 400) - 80);
    }
  },
  {
    id: 'war_cry', rarity: 'uncommon',
    name: 'WAR CRY', icon: '⚡',
    desc: 'Massive permanent speed boost.',
    apply(state) { state.baseInterval = Math.max(70, state.baseInterval - 25); }
  },
  // Rare
  {
    id: 'sharpshooter', rarity: 'rare',
    name: 'SHARPSHOOTER', icon: '🏹',
    desc: 'Piercing bullets + 4 bonus damage permanently.',
    apply(state) {
      state.bulletPiercing = true;
      state.bulletDamage = (state.bulletDamage || 2) + 4;
    }
  },
  {
    id: 'ironclad', rarity: 'rare',
    name: 'IRONCLAD', icon: '🐉',
    desc: '+5 shields and triple growth per apple.',
    apply(state) {
      state.shields = Math.min(10, (state.shields || 0) + 5);
      state.growPerApple = Math.min(30, Math.round(state.growPerApple * 3));
    }
  },
  // Epic
  {
    id: 'omega_pulse', rarity: 'epic',
    name: 'OMEGA PULSE', icon: '💫',
    desc: 'PULSE ×5 — massive blast on apple pickup.',
    apply(state) { state.pulse = (state.pulse || 0) + 5; }
  },
  {
    id: 'shadow_walk', rarity: 'epic',
    name: 'SHADOW WALK', icon: '👻',
    desc: 'Phase walk + scatter all enemies instantly.',
    apply(state) {
      state.ghost = (state.ghost || 0) + 1;
      const head = state.snake[0];
      for (const e of state.enemies) {
        const angle = Math.random() * Math.PI * 2;
        e.x = head.x + Math.cos(angle) * (15 + Math.random() * 10);
        e.y = head.y + Math.sin(angle) * (15 + Math.random() * 10);
      }
    }
  },
  // Legendary
  {
    id: 'annihilate', rarity: 'legendary',
    name: 'ANNIHILATE', icon: '☄️',
    desc: 'Destroy ALL enemies instantly. Gain score for each.',
    apply(state) {
      for (const e of state.enemies) {
        state.score += (ENEMY_TYPES[e.type] ? ENEMY_TYPES[e.type].score : 5);
        state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
      }
      state.enemies = [];
    }
  },
  {
    id: 'decimator', rarity: 'legendary',
    name: 'DECIMATOR', icon: '💣',
    desc: 'Explosive + piercing rounds. +8 damage. +5 multishot.',
    apply(state) {
      state.bulletExplosive = true;
      state.bulletPiercing = true;
      state.bulletDamage = (state.bulletDamage || 2) + 8;
      state.multishot = (state.multishot || 0) + 5;
    }
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

function clearNightmareUnlocked() {
  try { localStorage.removeItem('nightmare_unlocked'); } catch (_) {}
}

function escapeHtml(str) {
  return String(str).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
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
  const head = state.snake[0];
  const range = 10;
  let cell;
  let attempts = 0;
  do {
    cell = {
      x: Math.round(head.x + (Math.random() - 0.5) * range * 2),
      y: Math.round(head.y + (Math.random() - 0.5) * range * 2),
    };
    attempts++;
  } while ((
    state.snake.some(s => { const dx = cell.x - s.x, dy = cell.y - s.y; return dx * dx + dy * dy < 1; }) ||
    state.apples.some(a => Math.abs(a.x - cell.x) < 0.5 && Math.abs(a.y - cell.y) < 0.5) ||
    state.enemies.some(e => Math.round(e.x) === cell.x && Math.round(e.y) === cell.y) ||
    (state.chests || []).some(c => Math.abs(c.x - cell.x) < 0.5 && Math.abs(c.y - cell.y) < 0.5)
  ) && attempts < 400);
  return cell;
}

function spawnApple(state) {
  const cell = emptyCell(state);
  state.apples.push({ x: cell.x, y: cell.y, fx: cell.x, fy: cell.y });
}

function pickChestRarity() {
  const total = CHEST_RARITIES_TOTAL_WEIGHT;
  let rand = Math.random() * total;
  for (const r of CHEST_RARITIES) {
    rand -= r.weight;
    if (rand <= 0) return r.id;
  }
  return 'common';
}

function chestCellOutsideFOV(state) {
  // Spawn just outside the player's visible area (1–4 cells beyond each FOV edge)
  const head = state.snake[0];
  const fovHalfX = Math.floor(VIEW_COLS / 2) + 1; // first col outside horizontal FOV
  const fovHalfY = Math.floor(VIEW_ROWS / 2) + 1; // first row outside vertical FOV
  const pad = 3; // up to 3 extra cells beyond the FOV edge (total offset: 1–4)
  let cell;
  let attempts = 0;
  do {
    const side = randInt(4); // 0=left 1=right 2=top 3=bottom
    let cx, cy;
    switch (side) {
      case 0:
        cx = Math.round(head.x - fovHalfX - (1 + randInt(pad)));
        cy = Math.round(head.y + (Math.random() - 0.5) * VIEW_ROWS);
        break;
      case 1:
        cx = Math.round(head.x + fovHalfX + (1 + randInt(pad)));
        cy = Math.round(head.y + (Math.random() - 0.5) * VIEW_ROWS);
        break;
      case 2:
        cx = Math.round(head.x + (Math.random() - 0.5) * VIEW_COLS);
        cy = Math.round(head.y - fovHalfY - (1 + randInt(pad)));
        break;
      default:
        cx = Math.round(head.x + (Math.random() - 0.5) * VIEW_COLS);
        cy = Math.round(head.y + fovHalfY + (1 + randInt(pad)));
        break;
    }
    cell = { x: cx, y: cy };
    attempts++;
  } while ((
    state.snake.some(s => { const dx = cell.x - s.x, dy = cell.y - s.y; return dx * dx + dy * dy < 1; }) ||
    state.apples.some(a => Math.abs(a.x - cell.x) < 0.5 && Math.abs(a.y - cell.y) < 0.5) ||
    state.enemies.some(e => Math.round(e.x) === cell.x && Math.round(e.y) === cell.y) ||
    (state.chests || []).some(c => Math.abs(c.x - cell.x) < 0.5 && Math.abs(c.y - cell.y) < 0.5)
  ) && attempts < 200);
  return cell;
}

function spawnChest(state) {
  const rarity = pickChestRarity();
  const items = CHEST_ITEMS.filter(ci => ci.rarity === rarity);
  if (!items.length) return;
  const item = items[randInt(items.length)];
  const cell = chestCellOutsideFOV(state);
  state.chests.push({ x: cell.x, y: cell.y, rarity, itemId: item.id, spawnTime: performance.now() });
}

function drawChests(ctx, state, tick, grid = GRID) {
  if (!state.chests || !state.chests.length) return;
  for (const chest of state.chests) {
    const rData = CHEST_RARITIES.find(r => r.id === chest.rarity);
    if (!rData) continue;
    const item = CHEST_ITEMS.find(ci => ci.id === chest.itemId);
    const cx = chest.x * grid + grid / 2;
    const cy = chest.y * grid + grid / 2;
    const pulse = 0.9 + 0.1 * Math.sin(tick * 0.08);
    const r = grid * 0.85 * pulse;

    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = rData.glowColor;

    // Chest body (bottom rect)
    ctx.fillStyle = rData.color;
    ctx.fillRect(cx - r, cy - r * 0.2, r * 2, r * 1.1);
    // Chest lid (top rect)
    ctx.fillRect(cx - r, cy - r * 1.1, r * 2, r * 0.9);
    // Divider stripe
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - r, cy - r * 0.25, r * 2, r * 0.1);
    // Clasp
    ctx.fillStyle = '#ffdd66';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#fff8aa';
    ctx.fillRect(cx - r * 0.22, cy - r * 0.65, r * 0.44, r * 0.65);

    ctx.shadowBlur = 0;
    // Item icon above chest
    if (item) {
      ctx.font = `${r * 1.1}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(item.icon, cx, cy - r * 1.1);
    }
    // Rarity label below chest
    ctx.font = `bold ${r * 0.52}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rData.color;
    ctx.fillText(rData.name, cx, cy + r * 0.95);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

function pickUpgrades(state) {
  // Filter out one-time upgrades the player already owns
  const available = UPGRADES.filter(u => !(u.oneTime && state.upgradeCount[u.id]));

  // Weight upgrades so ones we already have appear less often
  const weighted = available.map(u => ({
    upgrade: u,
    weight: 1 / (1 + (state.upgradeCount[u.id] || 0) * 0.3)
  }));
  const pool = [];
  weighted.forEach(({ upgrade, weight }) => {
    const times = Math.max(1, Math.round(weight * 10));
    for (let i = 0; i < times; i++) pool.push(upgrade);
  });
  const choiceCount = state.oracle ? 4 : 3;
  const seen = new Set();
  const choices = [];
  const shuffled = shuffle(pool);
  for (const u of shuffled) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      choices.push(u);
    }
    if (choices.length === choiceCount) break;
  }
  // Fill to choiceCount if needed
  for (const u of available) {
    if (choices.length >= choiceCount) break;
    if (!seen.has(u.id)) { seen.add(u.id); choices.push(u); }
  }
  return choices;
}

// ── Enemy types ──────────────────────────────
const ENEMY_TYPES = {
  chaser: {
    color: '#9933ff',
    glowColor: 'rgba(153,51,255,0.4)',
    size: 1.2,
    shape: 'circle',
    speed: 0.0018,
    score: 5,
    maxHp: 3,
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
    color: '#1155dd',
    glowColor: 'rgba(17,85,220,0.4)',
    size: 1.1,
    shape: 'square',
    speed: 0.0022,
    score: 8,
    maxHp: 4,
    label: 'PATROLLER',
    init(e) {
      e.angle = Math.random() * Math.PI * 2;
      e.turnTimer = 0;
      e.chaseTimer = 0;
    },
    update(e, state, dt) {
      e.turnTimer = (e.turnTimer || 0) + dt;
      e.chaseTimer = (e.chaseTimer || 0) + dt;
      // Occasionally switch to chasing
      if (e.chaseTimer > 4000) {
        const head = state.snake[0];
        e.angle = Math.atan2(head.y - e.y, head.x - e.x);
        e.chaseTimer = 0;
      } else if (e.turnTimer > 3000 + randInt(3000)) {
        e.angle += (Math.random() - 0.5) * Math.PI * 1.5;
        e.turnTimer = 0;
      }
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += Math.cos(e.angle) * spd;
      e.y += Math.sin(e.angle) * spd;
    }
  },
  phantom: {
    color: 'rgba(180,200,255,0.85)',
    glowColor: 'rgba(160,180,255,0.6)',
    size: 0.9,
    shape: 'ghost',
    speed: 0.0024,
    score: 20,
    maxHp: 5,
    label: 'PHANTOM',
    isGhost: true,
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
  titan: {
    color: '#c00060',
    glowColor: 'rgba(200,0,100,0.5)',
    size: 2.4,
    shape: 'hexagon',
    speed: 0.0008,
    score: 30,
    maxHp: 15,
    label: 'TITAN',
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
  speeder: {
    color: '#00e0c0',
    glowColor: 'rgba(0,200,180,0.4)',
    size: 0.7,
    shape: 'circle',
    speed: 0.0042,
    score: 10,
    maxHp: 2,
    label: 'SPEEDER',
    init(e) {
      e.angle = Math.random() * Math.PI * 2;
      e.zigTimer = 0;
    },
    update(e, state, dt) {
      e.zigTimer = (e.zigTimer || 0) + dt;
      if (e.zigTimer > 800 + randInt(600)) {
        const head = state.snake[0];
        e.angle = Math.atan2(head.y - e.y, head.x - e.x) + (Math.random() - 0.5) * 1.2;
        e.zigTimer = 0;
      }
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += Math.cos(e.angle) * spd;
      e.y += Math.sin(e.angle) * spd;
    }
  },
};

// ── Time-based enemy scaling ─────────────────
function getTargetEnemyCount(elapsedMs, nightmareMode) {
  const s = elapsedMs / 1000;
  let count;
  if      (s < 30)  count = 2;
  else if (s < 60)  count = 6;
  else if (s < 90)  count = 12;
  else if (s < 150) count = 25;
  else              count = Math.floor(25 + (s - 150) / 30 * 8);
  return nightmareMode ? Math.floor(count * 3) : count;
}

function getEnemyTypeKeys(elapsedMs, nightmareMode) {
  const s = elapsedMs / 1000;
  // Start mostly chasers; other types unlock over time
  const keys = ['chaser', 'chaser', 'chaser'];
  if (s >= 60  || nightmareMode) keys.push('patrol');
  if (s >= 90  || nightmareMode) keys.push('speeder');
  if (s >= 120 || nightmareMode) keys.push('phantom');
  if (s >= 180 || nightmareMode) keys.push('titan');
  return keys;
}

function spawnEnemy(state, elapsedMs) {
  elapsedMs = elapsedMs || 0;
  const typeKeys = getEnemyTypeKeys(elapsedMs, state.nightmareMode);
  const typeKey = typeKeys[randInt(typeKeys.length)];
  const type = ENEMY_TYPES[typeKey];

  const head = state.snake[0];
  const spawnRange = VIEW_COLS / 2 + 3;
  let pos;
  let attempts = 0;
  do {
    const edge = randInt(4);
    if (edge === 0)      pos = { x: head.x - spawnRange + Math.random() * spawnRange * 2, y: head.y - spawnRange };
    else if (edge === 1) pos = { x: head.x - spawnRange + Math.random() * spawnRange * 2, y: head.y + spawnRange };
    else if (edge === 2) pos = { x: head.x - spawnRange, y: head.y - spawnRange + Math.random() * spawnRange * 2 };
    else                 pos = { x: head.x + spawnRange, y: head.y - spawnRange + Math.random() * spawnRange * 2 };
    attempts++;
  } while ((
    Math.abs(pos.x - head.x) + Math.abs(pos.y - head.y) < 8 ||
    state.snake.some(s => { const bx = pos.x - s.x, by = pos.y - s.y; return bx * bx + by * by < 4; })
  ) && attempts < 50);

  const speedMult = 1 + (elapsedMs / 1000) / 80;
  const enemy = {
    x: pos.x, y: pos.y,
    type: typeKey,
    speed: type.speed * speedMult * (state.nightmareMode ? 2.5 : 1.0),
    hp: type.maxHp || 1,
    maxHp: type.maxHp || 1,
    id: Math.random(),
  };

  if (type.init) type.init(enemy, state);

  if (state.repel && state.repel > 0) {
    enemy.x += (Math.random() - 0.5) * state.repel * 3;
    enemy.y += (Math.random() - 0.5) * state.repel * 3;
  }

  state.enemies.push(enemy);
}

// ── Rendering helpers ─────────────────────────
function drawGrid(ctx, camX, camY) {
  const startX = Math.floor((camX || 0) - VIEW_COLS / 2) - 1;
  const endX   = startX + VIEW_COLS + 2;
  const startY = Math.floor((camY || 0) - VIEW_ROWS / 2) - 1;
  const endY   = startY + VIEW_ROWS + 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  for (let x = startX; x <= endX; x++) {
    ctx.beginPath(); ctx.moveTo(x * GRID, startY * GRID); ctx.lineTo(x * GRID, endY * GRID); ctx.stroke();
  }
  for (let y = startY; y <= endY; y++) {
    ctx.beginPath(); ctx.moveTo(startX * GRID, y * GRID); ctx.lineTo(endX * GRID, y * GRID); ctx.stroke();
  }
}

function drawFixedGrid(ctx, cols, rows, grid) {
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
    const alpha = 0.35 + 0.65 * (1 - i / snake.length);
    ctx.strokeStyle = `rgba(40, 160, 80, ${alpha})`;
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

  // Cute pistol held in snake's mouth (extends forward from head)
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  const gx = hr * 0.75;          // start just in front of head centre
  const gl = hr * 1.9;           // barrel length
  const gh = hr * 0.28;          // barrel height
  // Barrel
  ctx.fillStyle = '#8a8aaa';
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#555';
  ctx.fillRect(gx, -gh / 2, gl, gh);
  // Grip
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(gx + gl * 0.25, gh * 0.4, gh * 0.9, gh * 1.4);
  // Tiny highlight on barrel
  ctx.fillStyle = 'rgba(200,200,255,0.3)';
  ctx.fillRect(gx + 2, -gh / 2 + 1, gl - 4, gh * 0.4);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore();
}

function drawApples(ctx, state, tick, grid = GRID) {
  for (const apple of state.apples) {
    const ax = apple.fx !== undefined ? apple.fx : apple.x;
    const ay = apple.fy !== undefined ? apple.fy : apple.y;
    const pulse = 0.85 + 0.15 * Math.sin(tick * 0.08);
    const size = grid * 1.6 * pulse;
    const cx = ax * grid + grid / 2;
    const cy = ay * grid + grid / 2;

    // Choose sprite: dropped apples use yellow, regular apples use red
    const sprite = apple.dropped ? APPLE_IMG_YELLOW : APPLE_IMG_RED;

    if (sprite.complete && sprite.naturalWidth > 0) {
      // Draw sprite centred on the apple position
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = apple.dropped ? '#a60' : '#c30';
      ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Fallback: canvas drawing while sprite loads
      const r = size / 2;
      const appleColor = apple.dropped ? '#cc8800' : '#cc2200';
      const glowColor  = apple.dropped ? '#a60'    : '#c30';
      const stemColor  = apple.dropped ? '#6a3a00' : '#5a3a10';
      const leafColor  = apple.dropped ? '#806020' : '#3a8020';

      ctx.shadowBlur = 14;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = appleColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,200,180,0.3)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = stemColor;
      ctx.lineWidth = r * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.22, cy - r * 1.45);
      ctx.stroke();

      ctx.fillStyle = leafColor;
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.42, cy - r * 1.35, r * 0.36, r * 0.17, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
    }
  }
}

function drawTeleportPerks(ctx, teleportPerks, tick, grid = GRID) {
  for (const tp of teleportPerks) {
    const pulse = 0.85 + 0.15 * Math.sin(tick * 0.1 + 1.5);
    const size = grid * 1.6 * pulse;
    const r = size / 2;
    const cx = tp.x * grid + grid / 2;
    const cy = tp.y * grid + grid / 2;

    if (TELEPORT_PERK_IMG.complete && TELEPORT_PERK_IMG.naturalWidth > 0) {
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#0af';
      ctx.drawImage(TELEPORT_PERK_IMG, cx - size / 2, cy - size / 2, size, size);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Fallback: canvas drawing while sprite loads
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#0af';
      ctx.fillStyle = '#0cf';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Inner cross to distinguish from apple
      ctx.strokeStyle = 'rgba(0,30,60,0.7)';
      ctx.lineWidth = grid * 0.1;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx + r * 0.5, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
    }
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

    if (type.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (type.shape === 'square') {
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    } else if (type.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();
      ctx.fill();
    } else if (type.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    } else if (type.shape === 'hexagon') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (type.shape === 'ghost') {
      ctx.globalAlpha = 0.70 + 0.12 * Math.sin(tick * 0.07 + e.id * 5);
      const wt = tick * 0.04;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
      ctx.lineTo(cx + r, cy + r * 0.55);
      ctx.quadraticCurveTo(cx + r * 0.65, cy + r * (1.0 + Math.sin(wt) * 0.25),       cx + r * 0.33, cy + r * 0.55);
      ctx.quadraticCurveTo(cx,             cy + r * (1.05 + Math.sin(wt + 1.1) * 0.25), cx - r * 0.33, cy + r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.65, cy + r * (1.0 + Math.sin(wt + 2.2) * 0.25), cx - r, cy + r * 0.55);
      ctx.lineTo(cx - r, cy - r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // "eye" dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Health bar (shown when enemy has taken damage)
    const maxHp = e.maxHp || 1;
    if (e.hp < maxHp) {
      const barW = r * 2.4;
      const barH = 3;
      const barX = cx - barW / 2;
      const barY = cy - r - 7;
      ctx.fillStyle = '#400';
      ctx.fillRect(barX, barY, barW, barH);
      const hpFrac = Math.max(0, e.hp / maxHp);
      ctx.fillStyle = hpFrac > 0.5 ? '#4f4' : hpFrac > 0.25 ? '#ff4' : '#f44';
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
    }
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

function drawBullets(ctx, bullets, grid = GRID) {
  if (!bullets || !bullets.length) return;
  for (const b of bullets) {
    const alpha = b.life / b.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff0';
    ctx.fillStyle = '#ffe040';
    ctx.beginPath();
    ctx.arc(b.x * grid + grid / 2, b.y * grid + grid / 2, grid * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function spawnParticles(particles, x, y, color, count, grid = GRID) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x * grid + grid / 2 + (Math.random() - 0.5) * grid,
      y: y * grid + grid / 2 + (Math.random() - 0.5) * grid,
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
// Must match QUICK_PLAY_WAIT_MS in server.js
const QUICK_PLAY_WAIT_S = 8;
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

const API_SERVER = (() => {
  if (typeof location === 'undefined' || location.protocol === 'file:') {
    return 'https://doxnaf-online.onrender.com';
  }
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return '';
  }
  return 'https://doxnaf-online.onrender.com';
})();

const SPECTATE_POLL_INTERVAL_MS = 500;

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
    this._resizeCanvas(false);

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
    this.isQuickPlay    = false; // true while in quick-play matchmaking flow
    this.onlineIsBot    = false; // true when playing against the server bot

    // ── Lore / horror state ──────────────────
    this.gameStartTime       = 0;
    this.loreNextFlickerTime = 0;
    this.loreFlickerEndTime  = 0;
    this.loreEventActive     = false;
    this.loreEventStart      = 0;
    this._audioCtx           = null;

    // ── Mouse / joystick input state ──────────
    this._mouseGridX       = VIEW_COLS / 2 + 2;
    this._mouseGridY       = VIEW_ROWS / 2;
    this._mouseOnlineGridX = ONLINE_COLS / 2;
    this._mouseOnlineGridY = ONLINE_ROWS / 2;
    this._mouseActive      = false;
    this._mouseIsDown      = false;
    this._lastSentDir      = null;
    this._joystickAngle    = 0;
    this._joystickHasInput = false;
    this._gunJoystickAngle  = 0;
    this._gunJoystickActive = false;
    this._lastFrameTime    = 0;

    // ── Settings ──────────────────────────────
    try { this._controlMode = localStorage.getItem('controlMode') || 'mouse'; }
    catch(_) { this._controlMode = 'mouse'; }
    try { this._playerName = localStorage.getItem('playerName') || ''; }
    catch(_) { this._playerName = ''; }

    // ── Admin state ──────────────────────────
    this._adminMode  = false;
    this._adminToken = null;
    this._adminPanelOpen = false;
    this._setupAdmin();

    // ── Singleplayer session (admin observability) ──
    this._spWs        = null;
    this._spSessionId = null;

    // ── Admin spectate state ──
    this._spectateSessionId = null;
    this._spectateInterval  = null;

    window.addEventListener('resize', () => {
      const isNightmare = this.state && this.state.nightmareMode;
      if (!isNightmare) this._resizeCanvas(false);
    });

    this._keys = {};
    this._setupInput();
    this._loop = this._gameLoop.bind(this);
    requestAnimationFrame(this._loop);

    this._renderOverlay();
    this._checkRemovalNotice();
  }

  _resizeCanvas(nightmareMode) {
    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 640;
    if (nightmareMode || isMobile) {
      VIEW_COLS = NIGHTMARE_COLS;
      VIEW_ROWS = NIGHTMARE_ROWS;
      W = VIEW_COLS * GRID;
      H = VIEW_ROWS * GRID;
      this.canvas.width  = W;
      this.canvas.height = H;
      document.getElementById('app').classList.remove('game-fullscreen');
    } else {
      VIEW_COLS = Math.floor(window.innerWidth / GRID);
      VIEW_ROWS = Math.floor(window.innerHeight / GRID);
      W = VIEW_COLS * GRID;
      H = VIEW_ROWS * GRID;
      this.canvas.width  = W;
      this.canvas.height = H;
      document.getElementById('app').classList.add('game-fullscreen');
    }
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

    document.addEventListener('keyup', e => {
      if (e.key in this._keys) this._keys[e.key] = false;
    });

    // ── Mouse steering (desktop) ─────────────────
    // Use document so mouse position is tracked even outside the canvas/map
    document.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this._mouseGridX       = (e.clientX - rect.left) * (VIEW_COLS       / rect.width);
      this._mouseGridY       = (e.clientY - rect.top)  * (VIEW_ROWS       / rect.height);
      this._mouseOnlineGridX = (e.clientX - rect.left) * (ONLINE_COLS / rect.width);
      this._mouseOnlineGridY = (e.clientY - rect.top)  * (ONLINE_ROWS / rect.height);
      this._mouseActive = true;
      if (this.phase === 'playing') this._inputReceived = true;
    });

    // ── Mouse shoot (desktop) ─────────────────────
    document.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this._mouseIsDown = true;
        if (this.phase === 'start' || this.phase === 'gameover') { return; }
        this._tryShoot();
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this._mouseIsDown = false;
    });

    // Remove old click-to-start handler (mousedown replaces it)
    // this.canvas.addEventListener('click', ...) removed intentionally

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
        if (this.phase === 'start' || this.phase === 'gameover') { return; }
        const t0 = e.changedTouches[0];
        this._joystickTouchId = t0.identifier;
        this._joystickOriginX = t0.clientX;
        this._joystickOriginY = t0.clientY;
        updateKnob(0, 0);
      }, { passive: false });

      joystickArea.addEventListener('touchmove', e => {
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.identifier === this._joystickTouchId);
        if (!touch) return;
        const dx = touch.clientX - (this._joystickOriginX || 0);
        const dy = touch.clientY - (this._joystickOriginY || 0);
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
        if (Array.from(e.changedTouches).some(t => t.identifier === this._joystickTouchId)) {
          this._joystickTouchId = null;
        }
        // Keep _joystickHasInput = true so snake continues in last direction
        updateKnob(0, 0); // just visually re-center knob
      }, { passive: false });
    }

    // ── Gun joystick (mobile) ─────────────────────
    const gunArea = document.getElementById('gun-joystick-area');
    const gunKnob = document.getElementById('gun-joystick-knob');
    const updateGunKnob = (dx, dy) => {
      if (!gunKnob) return;
      const len = Math.sqrt(dx * dx + dy * dy);
      const cx  = len > 0 ? dx / len * Math.min(JMAX, len) : 0;
      const cy  = len > 0 ? dy / len * Math.min(JMAX, len) : 0;
      gunKnob.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
    };
    if (gunArea) {
      gunArea.addEventListener('touchstart', e => {
        e.preventDefault();
        const t0 = e.changedTouches[0];
        this._gunTouchId = t0.identifier;
        this._gunOriginX = t0.clientX;
        this._gunOriginY = t0.clientY;
        this._gunJoystickActive = true;
        updateGunKnob(0, 0);
      }, { passive: false });
      gunArea.addEventListener('touchmove', e => {
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.identifier === this._gunTouchId);
        if (!touch) return;
        const dx = touch.clientX - (this._gunOriginX || 0);
        const dy = touch.clientY - (this._gunOriginY || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8) {
          this._gunJoystickAngle = Math.atan2(dy, dx);
          updateGunKnob(dx, dy);
        }
      }, { passive: false });
      gunArea.addEventListener('touchend', e => {
        e.preventDefault();
        if (Array.from(e.changedTouches).some(t => t.identifier === this._gunTouchId)) {
          this._gunJoystickActive = false;
          this._gunTouchId = null;
        }
        updateGunKnob(0, 0);
      }, { passive: false });
    }

    // Mobile teleport button (multiplayer)
    const mobileTeleportBtn = document.getElementById('mobile-teleport-btn');
    if (mobileTeleportBtn) {
      const sendTeleport = (e) => {
        e.preventDefault();
        if (this.phase === 'online_playing' && this.online && this.online.readyState === WebSocket.OPEN) {
          this.online.send(JSON.stringify({ type: 'teleport' }));
        }
      };
      mobileTeleportBtn.addEventListener('touchstart', sendTeleport, { passive: false });
      mobileTeleportBtn.addEventListener('click', sendTeleport);
    }
  }

  _angle4Dir(angle) {
    const p = Math.PI;
    if (angle > -p / 4 && angle <= p / 4)   return { x:  1, y:  0 };
    if (angle > p / 4  && angle <= 3 * p / 4) return { x:  0, y:  1 };
    if (angle > -3 * p / 4 && angle <= -p / 4) return { x:  0, y: -1 };
    return { x: -1, y: 0 };
  }

  // ── Shooting ──────────────────────────────────
  _tryShoot() {
    if (!this.state || this.phase !== 'playing') return;
    const state = this.state;
    const head = state.snake[0];
    // Aim toward mouse cursor regardless of control mode; fall back to snake heading if mouse not available
    let angle;
    if (this._mouseActive) {
      angle = Math.atan2(
        this._mouseGridY - VIEW_ROWS / 2,
        this._mouseGridX - VIEW_COLS / 2
      );
    } else {
      angle = state.snakeAngle;
    }
    this._shoot(head.x, head.y, angle);
  }

  _shoot(x, y, angle) {
    const state = this.state;
    if (!state) return;
    const now = performance.now();
    if (now - (state.lastShot || 0) < state.shootInterval) return;
    state.lastShot = now;

    const shots = 1 + (state.multishot || 0);
    for (let i = 0; i < shots; i++) {
      const spread = shots > 1 ? (i - (shots - 1) / 2) * BULLET_SPREAD_ANGLE : 0;
      const a = angle + spread;
      state.bullets.push({
        x, y,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: BULLET_LIFE_MS,
        maxLife: BULLET_LIFE_MS,
      });
    }
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
    // Reset joystick/input state so new game starts clean
    this._joystickHasInput = false;
    this._gunJoystickActive = false;
    this._mouseIsDown = false;
    this.flashTimer = 0;
    this._lastFrameTime = 0;
    this._lastUpdateTimestamp = 0;
    this._inputReceived = false;
    document.getElementById('app').classList.remove('nightmare-mode');
    this._resizeCanvas(false);

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
      direction: { x: 1, y: 0 }, // kept for online compat
      apples: [],
      enemies: [],
      chests: [],
      nextChestSpawn: CHEST_FIRST_SPAWN_MS, // first chest spawns at 30 s
      chestNotif: null,
      score: 0,
      applesEaten: 0,
      baseInterval: 140,
      growBuffer: 0,
      growPerApple: 2,
      shields: 0,
      ghost: 0,
      freeze: 0,
      repel: 0,
      pulse: 0,
      upgradeCount: {},
      enemySpawnTimer: 0,
      applesForNextUpgrade: 1,
      applesEatenSinceUpgrade: 0,
      nightmareMode: false,
      pulseEffects: [],
      // Pistol
      bullets: [],
      lastShot: 0,
      shootInterval: 400,
      bulletDamage: 2,
      bulletPiercing: false,
      bulletExplosive: false,
      multishot: 0,
    };

    // Initial apples
    spawnApple(this.state);
    spawnApple(this.state);

    this.phase = 'playing';
    this._hideOverlay();
    this._hideUpgradePanel();
    this._updateHUD();
    this._connectSpSession();
  }

  _startNightmareMode() {
    this._startGame();
    this.state.nightmareMode = true;
    document.getElementById('app').classList.add('nightmare-mode');
    this._resizeCanvas(true);
  }

  _playNightmareJumpscare() {
    this.phase = 'nightmare_jumpscare';
    this.nightmareJumpscareStart = performance.now();
    document.getElementById('app').classList.remove('nightmare-mode');
    this._playScreech();
    // Capture score before state is cleared
    const nmScore   = this.state ? (this.state.score || 0) : 0;
    const nmApples  = this.state ? (this.state.applesEaten || 0) : 0;
    this._jumpscareTimeout = setTimeout(() => {
      this.state = null;
      this.phase = 'gameover';
      const el = document.getElementById('overlay');
      el.className = 'gameover';
      el.style.display = '';
      el.innerHTML = `
        <h1>☠ YOU DIED</h1>
        <div class="info">NIGHTMARE MODE</div>
        <div class="score-display">SCORE: ${nmScore} &nbsp;|&nbsp; APPLES: ${nmApples}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="btn btn-lore" id="nm-restart-btn">NIGHTMARE AGAIN</button>
          <button class="btn btn-back" id="nm-menu-btn">← MENU</button>
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:#c33;letter-spacing:1px;">☠ NIGHTMARE LEADERBOARD</div>
          <div id="nm-leaderboard-list" style="font-size:11px;color:#888;margin-top:4px;">Loading…</div>
        </div>
      `;
      document.getElementById('nm-restart-btn').addEventListener('click', () => this._startNightmareMode());
      document.getElementById('nm-menu-btn').addEventListener('click', () => {
        this.phase = 'start';
        this._renderOverlay();
      });
      this._submitNightmareScore(nmScore, nmApples);
      this._loadNightmareLeaderboard('nm-leaderboard-list');
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

    const elapsedMs = timestamp - this.gameStartTime;

    // ── Steer snake toward mouse / joystick / WASD ──────
    let targetAngle = state.targetAngle;
    if (this._joystickHasInput) {
      targetAngle = this._joystickAngle;
    } else if (this._controlMode === 'wasd') {
      let dx = 0, dy = 0;
      if (this._keys['ArrowRight'] || this._keys['d'] || this._keys['D']) dx += 1;
      if (this._keys['ArrowLeft']  || this._keys['a'] || this._keys['A']) dx -= 1;
      if (this._keys['ArrowDown']  || this._keys['s'] || this._keys['S']) dy += 1;
      if (this._keys['ArrowUp']    || this._keys['w'] || this._keys['W']) dy -= 1;
      if (dx !== 0 || dy !== 0) { targetAngle = Math.atan2(dy, dx); this._inputReceived = true; }
    } else if (this._mouseActive) {
      const dx = this._mouseGridX - VIEW_COLS / 2;
      const dy = this._mouseGridY - VIEW_ROWS / 2;
      if (dx * dx + dy * dy > 0.09) {
        targetAngle = Math.atan2(dy, dx);
      }
    }
    state.targetAngle = targetAngle;

    // Smoothly rotate heading toward target
    const diff = normalizeAngle(targetAngle - state.snakeAngle);
    const maxTurn = MAX_TURN_SPD * dt / 1000;
    state.snakeAngle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    // Keep direction vector up-to-date for online mode
    state.direction = {
      x: Math.cos(state.snakeAngle),
      y: Math.sin(state.snakeAngle),
    };

    // ── Auto-shoot: mouse held down or gun joystick active ────
    if (this._mouseIsDown) {
      this._tryShoot();
    }
    if (this._gunJoystickActive && this.state) {
      this._shoot(state.snake[0].x, state.snake[0].y, this._gunJoystickAngle);
    }

    // ── Movement delay: snake doesn't move for first 5 seconds unless input received ──
    const canMove = this._inputReceived || (elapsedMs >= MOVEMENT_DELAY_MS);
    if (!canMove) return;

    // ── Move head forward ─────────────────────────
    const speed = dt / state.baseInterval;   // fraction of 1 grid-cell to move this frame
    const head = state.snake[0];
    let nx = head.x + Math.cos(state.snakeAngle) * speed;
    let ny = head.y + Math.sin(state.snakeAngle) * speed;

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
      const dx = seg.x - prev.x;
      const dy = seg.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SEG_SPACING) {
        const f  = SEG_SPACING / dist;
        seg.x = prev.x + dx * f;
        seg.y = prev.y + dy * f;
      }
    }

    // Grow: add one segment per frame until buffer depleted (cap at 2000 for performance)
    if (state.growBuffer > 0) {
      if (state.snake.length < 2000) {
        const last = state.snake[state.snake.length - 1];
        state.snake.push({ x: last.x, y: last.y });
      }
      state.growBuffer--;
    }

    // ── Apple eating (distance-based) ────────────
    for (let i = state.apples.length - 1; i >= 0; i--) {
      const apple = state.apples[i];
      const ax = apple.fx !== undefined ? apple.fx : apple.x;
      const ay = apple.fy !== undefined ? apple.fy : apple.y;
      const dx = ax - nx, dy = ay - ny;
      const eatDist = state.appleEatDist || APPLE_EAT_DIST;
      if (dx * dx + dy * dy < eatDist * eatDist) {
        state.apples.splice(i, 1);
        state.score += 1;
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
              state.score += ENEMY_TYPES[e.type].score;
              // Pulse instantly kills enemies
              state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
              state.enemies.splice(j, 1);
            }
          }
        }

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

    // ── Respawn apples that drifted too far from snake head ──────────
    for (const apple of state.apples) {
      if (apple.dropped) continue; // enemy-dropped apples stay in place
      const dax = apple.x - nx, day = apple.y - ny;
      if (dax * dax + day * day > VIEW_COLS * VIEW_COLS) {
        const cell = emptyCell(state);
        apple.x = cell.x; apple.y = cell.y;
        apple.fx = cell.x; apple.fy = cell.y;
      }
    }

    // ── Apple collision with snake body (push apples away) ───────────
    for (const apple of state.apples) {
      if (apple.dropped) continue; // enemy-dropped apples stay fixed
      const ax = apple.fx !== undefined ? apple.fx : apple.x;
      const ay = apple.fy !== undefined ? apple.fy : apple.y;
      let closestSeg = null;
      let closestDist2 = Infinity;
      for (let si = 0; si < state.snake.length; si++) {
        const s = state.snake[si];
        const bx = s.x - ax, by = s.y - ay;
        const d2 = bx * bx + by * by;
        if (d2 < ENEMY_BODY_DIST * ENEMY_BODY_DIST && d2 < closestDist2) {
          closestDist2 = d2; closestSeg = s;
        }
      }
      if (closestSeg) {
        const rx = ax - closestSeg.x;
        const ry = ay - closestSeg.y;
        const rLen = Math.sqrt(rx * rx + ry * ry) || 1;
        const pushTo = ENEMY_BODY_DIST + 0.05;
        apple.fx = closestSeg.x + (rx / rLen) * pushTo;
        apple.fy = closestSeg.y + (ry / rLen) * pushTo;
        apple.x = Math.round(apple.fx);
        apple.y = Math.round(apple.fy);
      }
    }

    // ── Enemy spawning (time-based target count) ──────────────
    state.enemySpawnTimer += dt;
    const targetCount = getTargetEnemyCount(elapsedMs, state.nightmareMode);
    const spawnInterval = state.nightmareMode ? 800 : (elapsedMs >= 90000 ? 400 : 2500);
    if (state.enemySpawnTimer >= spawnInterval && state.enemies.length < targetCount && elapsedMs >= 5000) {
      state.enemySpawnTimer = 0;
      spawnEnemy(state, elapsedMs);
    }

    // ── Chest spawning (time-based) ───────────────────────────
    if (elapsedMs >= state.nextChestSpawn && state.chests.length < 3 && !state.nightmareMode) {
      state.nextChestSpawn = elapsedMs + CHEST_SPAWN_BASE_MS;
      spawnChest(state);
    }

    // ── Chest pickup ──────────────────────────────────────────
    for (let i = state.chests.length - 1; i >= 0; i--) {
      const chest = state.chests[i];
      const cdx = chest.x - nx, cdy = chest.y - ny;
      const eatDist = state.appleEatDist || APPLE_EAT_DIST;
      if (cdx * cdx + cdy * cdy < eatDist * eatDist) {
        const item = CHEST_ITEMS.find(ci => ci.id === chest.itemId);
        if (item) {
          item.apply(state);
          state.chestNotif = {
            text: `${item.icon} ${item.name}`,
            subtext: item.desc,
            rarity: chest.rarity,
            until: performance.now() + 3000,
          };
        }
        state.chests.splice(i, 1);
        spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#ffcc00', 20);
        this._updateHUD();
      } else if (performance.now() - chest.spawnTime > CHEST_EXPIRE_MS) {
        // Chests expire after CHEST_EXPIRE_MS if not picked up
        state.chests.splice(i, 1);
      } else if (cdx * cdx + cdy * cdy > CHEST_RESPAWN_DIST * CHEST_RESPAWN_DIST) {
        // Player moved more than CHEST_RESPAWN_DIST cells away — reposition near their FOV
        const cell = chestCellOutsideFOV(state);
        chest.x = cell.x;
        chest.y = cell.y;
      }
    }

    // ── Bullet update ─────────────────────────────
    if (state.bullets && state.bullets.length) {
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) { state.bullets.splice(i, 1); continue; }

        // Bullet hits enemy
        let bulletRemoved = false;
        for (let j = state.enemies.length - 1; j >= 0; j--) {
          const e = state.enemies[j];
          const hitR = ENEMY_TYPES[e.type].size * 0.45;
          const bex = e.x - b.x, bey = e.y - b.y;
          if (bex * bex + bey * bey < hitR * hitR) {
            const dmg = state.bulletDamage || 2;
            if (state.bulletExplosive) {
              // Explosion: damage enemies in radius
              state.pulseEffects = state.pulseEffects || [];
              state.pulseEffects.push({ x: e.x, y: e.y, r: 0, maxR: EXPLOSIVE_ROUNDS_RADIUS, life: 1 });
              for (let k = state.enemies.length - 1; k >= 0; k--) {
                const ek = state.enemies[k];
                const exdx = ek.x - e.x, exdy = ek.y - e.y;
                if (exdx * exdx + exdy * exdy < EXPLOSIVE_ROUNDS_RADIUS * EXPLOSIVE_ROUNDS_RADIUS) {
                  ek.hp = (ek.hp || 1) - dmg;
                  spawnParticles(this.particles, Math.round(ek.x), Math.round(ek.y), '#ff8', 10);
                  if (ek.hp <= 0) {
                    state.score += ENEMY_TYPES[ek.type].score;
                    state.apples.push({ x: Math.round(ek.x), y: Math.round(ek.y), fx: ek.x, fy: ek.y, dropped: true });
                    state.enemies.splice(k, 1);
                    if (k < j) j--;
                  }
                }
              }
            } else {
              e.hp = (e.hp || 1) - dmg;
              spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#ff8', 8);
              if (e.hp <= 0) {
                state.score += ENEMY_TYPES[e.type].score;
                state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
                state.enemies.splice(j, 1);
              }
            }
            if (!state.bulletPiercing) { bulletRemoved = true; break; }
          }
        }
        if (bulletRemoved) state.bullets.splice(i, 1);
      }
    }

    // ── Enemy movement (per-frame with dt) ────────
    for (const e of state.enemies) {
      ENEMY_TYPES[e.type].update(e, state, dt);
    }

    // ── Enemy collision ───────────────────────────
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];

      // Head collision — head instantly kills enemy
      const hitR = ENEMY_TYPES[e.type].size * 0.45 + SNAKE_RADIUS;
      const hdx = e.x - nx, hdy = e.y - ny;
      if (hdx * hdx + hdy * hdy < hitR * hitR) {
        if (state.shields > 0) {
          state.shields--;
          spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#4af', 16);
          state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
          state.enemies.splice(i, 1);
          this.flashTimer = 20;
          if (this._checkLoreDamage(timestamp)) return;
          continue;
        }
        if (this._checkLoreDamage(timestamp)) return;
        this._die('enemy');
        return;
      }

      // Body collision — body deals minimum damage (1) with cooldown to avoid per-frame spam
      // Phantom enemies phase through the snake body — skip body collision
      if (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].isGhost) continue;
      let bodyHit = false;
      let closestBodySeg = null, closestBodyDx = 0, closestBodyDy = 0, closestBodyD2 = Infinity;
      const bodyR = ENEMY_TYPES[e.type].size * 0.40 + SNAKE_RADIUS;
      for (let si = 1; si < state.snake.length; si++) {
        const s = state.snake[si];
        const bx = e.x - s.x, by = e.y - s.y;
        const d2 = bx * bx + by * by;
        if (d2 < bodyR * bodyR && d2 < closestBodyD2) {
          bodyHit = true;
          closestBodySeg = s;
          closestBodyDx = bx; closestBodyDy = by; closestBodyD2 = d2;
        }
      }

      // Push enemy out of snake body so it cannot noclip through
      if (closestBodySeg) {
        const dist = Math.sqrt(closestBodyD2) || 0.001;
        e.x = closestBodySeg.x + (closestBodyDx / dist) * (bodyR + 0.02);
        e.y = closestBodySeg.y + (closestBodyDy / dist) * (bodyR + 0.02);
      }

      if (bodyHit) {
        const now2 = performance.now();
        if (!e.lastBodyHit || now2 - e.lastBodyHit >= 500) {
          e.lastBodyHit = now2;
          e.hp = (e.hp || 1) - 1; // body always deals 1 damage (minimum)
          spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#c0f', 6);
          if (e.hp <= 0) {
            state.score += ENEMY_TYPES[e.type].score;
            state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
            state.enemies.splice(i, 1);
          }
        }
      }
    }

    this._updateHUD();
  }

  _checkLoreDamage(timestamp) {
    if (this.loreEventActive) return false;
    if (this.state && this.state.nightmareMode) return false;
    if (timestamp - this.gameStartTime < 90000) return false;
    if (isNightmareUnlocked()) return false;
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
    // Re-render the main overlay (now nightmare button will appear)
    this._renderOverlay();
    document.getElementById('overlay').style.display = '';
  }

  _die(reason) {
    const state = this.state;
    spawnParticles(this.particles, state.snake[0].x, state.snake[0].y, '#f44', 20);
    this._disconnectSpSession();
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
    // Scale apples needed for next upgrade
    const totalPerks = Object.values(state.upgradeCount).reduce((a, b) => a + b, 0);
    if (totalPerks <= 10) {
      state.applesForNextUpgrade = 1 + Math.floor(totalPerks / 3);
    } else {
      // After 10 perks: significantly steeper cost
      const base = 1 + Math.floor(10 / 3); // = 4 at 10 perks
      const extra = totalPerks - 10;
      state.applesForNextUpgrade = base + extra * 2 + Math.floor(extra * extra / 4);
    }
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
      if (s.ghost) parts.push('👻');
      if (s.shields) parts.push(`🛡️×${s.shields}`);
      if (s.freeze) parts.push(`❄️×${s.freeze}`);
      if (s.repel) parts.push(`💥×${s.repel}`);
      if (s.pulse) parts.push(`💫×${s.pulse}`);
      if (s.oracle) parts.push('🔮');
      if (s.upgradeCount && s.upgradeCount['behemoth']) parts.push('🐉');
      if (s.upgradeCount && s.upgradeCount['rapid_fire']) parts.push(`🔫×${s.upgradeCount['rapid_fire']}`);
      if (s.bulletPiercing) parts.push('🏹');
      if (s.bulletExplosive) parts.push('💣');
      if (s.multishot) parts.push(`✳️×${s.multishot}`);
      if (s.bulletDamage && s.bulletDamage > 2) parts.push(`🔥×${s.bulletDamage - 2}`);
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
      drawFixedGrid(ctx, ONLINE_COLS, ONLINE_ROWS, ONLINE_GRID);

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
      const loreCamX = this.state ? this.state.snake[0].x : 0;
      const loreCamY = this.state ? this.state.snake[0].y : 0;
      const loreCamOffX = W / 2 - loreCamX * GRID;
      const loreCamOffY = H / 2 - loreCamY * GRID;
      ctx.save();
      ctx.translate(loreCamOffX, loreCamOffY);
      drawGrid(ctx, loreCamX, loreCamY);
      if (this.state) {
        drawApples(ctx, this.state, this.tick);
        drawSnake(ctx, this.state);
        drawEnemies(ctx, this.state, this.tick);
        drawParticles(ctx, this.particles);
      }
      ctx.restore();
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

    if (!state) return;

    // Camera transform: center view on snake head
    const camX = state.snake[0].x;
    const camY = state.snake[0].y;
    const camOffX = W / 2 - camX * GRID;
    const camOffY = H / 2 - camY * GRID;
    ctx.save();
    ctx.translate(camOffX, camOffY);

    drawGrid(ctx, camX, camY);

    // Draw elements
    drawApples(ctx, state, this.tick);
    drawChests(ctx, state, this.tick);
    drawBullets(ctx, state.bullets);
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

    ctx.restore();

    // ── Chest pickup notification (screen-space, after camera restore) ──
    if (state.chestNotif) {
      const now = performance.now();
      if (now < state.chestNotif.until) {
        const remaining = state.chestNotif.until - now;
        const alpha = Math.min(1, remaining / 600);
        const rData = CHEST_RARITIES.find(r => r.id === state.chestNotif.rarity);
        const color = rData ? rData.color : '#ffffff';
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 16;
        ctx.shadowColor = color;
        ctx.font = 'bold 22px Courier New';
        ctx.fillStyle = color;
        ctx.fillText(state.chestNotif.text, W / 2, H * 0.38);
        ctx.shadowBlur = 0;
        ctx.font = '12px Courier New';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(state.chestNotif.subtext, W / 2, H * 0.38 + 24);
        ctx.restore();
      } else {
        state.chestNotif = null;
      }
    }
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
    // Keep admin open button visible during gameplay when admin mode is active
    const adminOpenBtn = document.getElementById('admin-open-btn');
    if (adminOpenBtn) adminOpenBtn.style.display = this._adminMode ? '' : 'none';
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
          if (!u) return '';
          const countSuffix = (!u.oneTime && count > 1) ? ` ×${count}` : '';
          return `<span>${u.icon} ${u.name}${countSuffix}</span>`;
        })
        .filter(Boolean).join('  ');

      el.innerHTML = `
        <h1>YOU DIED</h1>
        <div class="score-display">SCORE: ${s.score} &nbsp;|&nbsp; APPLES: ${s.applesEaten}</div>
        <div class="info">You ${reasonText}.</div>
        ${upgradeNames ? `<div id="upgrades-list">${upgradeNames}</div>` : ''}
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="btn" id="restart-btn">PLAY AGAIN [Enter]</button>
          <button class="btn btn-back" id="menu-btn">← MENU</button>
        </div>
        <div class="controls">Mouse to steer · Mobile: joystick · LMB to shoot</div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:#555;letter-spacing:1px;">🏆 LEADERBOARD</div>
          <div id="leaderboard-list" style="font-size:11px;color:#888;margin-top:4px;">Loading…</div>
        </div>
      `;
      document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
      document.getElementById('menu-btn').addEventListener('click', () => {
        this.state = null;
        this.phase = 'start';
        this._renderOverlay();
      });
      // Submit score and load leaderboard
      this._submitScore(s.score, s.applesEaten);
      this._loadLeaderboard('leaderboard-list');
    }
  }

  _renderOverlay() {
    // Return to full-screen layout when showing main menu/start screen
    this._resizeCanvas(false);
    // Disconnect any active singleplayer session when returning to menu
    this._disconnectSpSession();
    // Clear HUD when returning to main menu
    document.getElementById('hud-upgrades').textContent   = '';
    document.getElementById('hud-apples').textContent     = '';
    document.getElementById('hud-timer').textContent      = '';
    document.getElementById('hud-lbl-apples').textContent = '';
    document.getElementById('hud-lbl-timer').textContent  = '';

    const el = document.getElementById('overlay');
    el.className = 'start';
    const nightmareUnlocked = isNightmareUnlocked();
    const ctrlLabel = this._controlMode === 'wasd' ? '⌨ WASD' : '🖱 MOUSE';
    const safeName = escapeHtml(this._playerName || '');
    el.innerHTML = `
      <h1>VIPER.exe</h1>
      <div class="info">
        A roguelike snake<br>
        Eat apples → choose upgrades → survive<br>
        Enemies grow stronger over time
      </div>
      <div class="name-chooser">
        <label for="player-name-input" style="font-size:12px;color:#aaa;letter-spacing:1px;">YOUR NAME</label><br>
        <input id="player-name-input" class="room-input" maxlength="20"
               placeholder="Anonymous" autocomplete="off" spellcheck="false"
               value="${safeName}" style="width:160px;margin-top:4px;" />
        <div id="name-warn" style="font-size:10px;color:#f55;min-height:14px;margin-top:2px;"></div>
      </div>
      <div class="controls">
        ${this._controlMode === 'wasd' ? 'WASD/Arrows to steer · Mouse to aim · LMB to shoot' : 'Mouse to steer · LMB to shoot'}<br>
        Mobile: joystick to move · gun joystick to shoot
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" id="start-btn">SOLO [Enter]</button>
        <button class="btn btn-online" id="online-btn">⚡ ONLINE</button>
        <button class="btn btn-settings" id="settings-btn">⚙ ${ctrlLabel}</button>
      </div>
      ${nightmareUnlocked ? '<button class="btn btn-lore" id="lore-red-btn">☠ NIGHTMARE</button>' : ''}
      <div id="leaderboard-section" style="margin-top:16px;">
        <div style="font-size:11px;color:#555;letter-spacing:1px;">🏆 LEADERBOARD</div>
        <div id="leaderboard-list" style="font-size:11px;color:#888;margin-top:4px;">Loading…</div>
      </div>
      ${nightmareUnlocked ? `
      <div id="nm-leaderboard-section" style="margin-top:12px;">
        <div style="font-size:11px;color:#933;letter-spacing:1px;">☠ NIGHTMARE LEADERBOARD</div>
        <div id="nm-leaderboard-list" style="font-size:11px;color:#888;margin-top:4px;">Loading…</div>
      </div>` : ''}
    `;
    const nameInput = document.getElementById('player-name-input');
    const nameWarn  = document.getElementById('name-warn');
    nameInput.addEventListener('input', () => {
      const val = nameInput.value.trim();
      if (nameContainsBannedWord(val)) {
        nameWarn.textContent = 'Name not allowed.';
        // Don't save a banned name; leave the stored name unchanged
      } else {
        nameWarn.textContent = '';
        this._playerName = val;
        try { localStorage.setItem('playerName', this._playerName); } catch(_) {}
      }
    });
    // Prevent Enter on name field from starting the game
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.stopPropagation(); });
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
    document.getElementById('online-btn').addEventListener('click', () => this._startOnlineMode());
    document.getElementById('settings-btn').addEventListener('click', () => this._toggleControlMode());
    const loreBtn = document.getElementById('lore-red-btn');
    if (loreBtn) loreBtn.addEventListener('click', () => this._startNightmareMode());
    this._loadLeaderboard('leaderboard-list');
    if (nightmareUnlocked) this._loadNightmareLeaderboard('nm-leaderboard-list');
    // Show admin open button on main menu (bottom-right, outside the overlay)
    this._showAdminOpenBtn();
    // Check if the player's leaderboard rank was removed
    this._checkRemovalNotice();
  }

  _toggleControlMode() {
    this._controlMode = this._controlMode === 'wasd' ? 'mouse' : 'wasd';
    try { localStorage.setItem('controlMode', this._controlMode); } catch(_) {}
    this._renderOverlay();
  }

  _submitScore(score, applesEaten) {
    if (score <= 0) return;
    const name = this._playerName || 'Anonymous';
    fetch(`${API_SERVER}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, applesEaten }),
    }).catch(() => {}); // silently ignore if server unavailable
  }

  _loadLeaderboard(targetId) {
    fetch(`${API_SERVER}/api/leaderboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const el = document.getElementById(targetId);
        if (!el) return;
        if (!data.entries || data.entries.length === 0) {
          el.textContent = 'No scores yet — be the first!';
          return;
        }
        el.innerHTML = data.entries.map((e, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const safeName = escapeHtml(e.name || 'Anonymous');
          return `<div>${medal} ${safeName} — ${e.score} pts (${e.applesEaten}🍎)</div>`;
        }).join('');
      })
      .catch(() => {
        const el = document.getElementById(targetId);
        if (el) el.textContent = 'Leaderboard unavailable';
      });
  }

  _submitNightmareScore(score, applesEaten) {
    if (score <= 0) return;
    const name = this._playerName || 'Anonymous';
    fetch(`${API_SERVER}/api/nightmare-leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, applesEaten }),
    }).catch(() => {}); // silently ignore if server unavailable
  }

  _loadNightmareLeaderboard(targetId) {
    fetch(`${API_SERVER}/api/nightmare-leaderboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const el = document.getElementById(targetId);
        if (!el) return;
        if (!data.entries || data.entries.length === 0) {
          el.textContent = 'No scores yet — be the first!';
          return;
        }
        el.innerHTML = data.entries.map((e, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const safeName = escapeHtml(e.name || 'Anonymous');
          return `<div>${medal} ${safeName} — ${e.score} pts (${e.applesEaten}🍎)</div>`;
        }).join('');
      })
      .catch(() => {
        const el = document.getElementById(targetId);
        if (el) el.textContent = 'Leaderboard unavailable';
      });
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
      const stackText = u.oneTime
        ? `<div class="stack" style="color:#7af">⚡ One time only</div>`
        : (stackCount > 0 ? `<div class="stack">Already have ×${stackCount}</div>` : '');
      return `
        <div class="upgrade-card" data-idx="${i}">
          <div class="icon">${u.icon}</div>
          <div class="name">${u.name}</div>
          <div class="desc">${u.desc}</div>
          ${stackText}
        </div>`;
    }).join('');

    const hintKeys = state.oracle ? '1 / 2 / 3 / 4' : '1 / 2 / 3';
    panel.innerHTML = `
      <h2>UPGRADE</h2>
      <div class="subtitle">Choose one power-up</div>
      <div class="upgrade-cards">${cardsHtml}</div>
      <div class="info" style="font-size:11px;color:#345">Click a card or press ${hintKeys}</div>
    `;

    panel.querySelectorAll('.upgrade-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        this._chooseUpgrade(this.pendingUpgrades[idx]);
      });
    });

    // Keyboard shortcuts
    const keyHandler = (e) => {
      const map = { '1': 0, '2': 1, '3': 2, '4': 3 };
      if (map[e.key] !== undefined && map[e.key] < this.pendingUpgrades.length) {
        document.removeEventListener('keydown', keyHandler);
        this._chooseUpgrade(this.pendingUpgrades[map[e.key]]);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  // ── Online mode ──────────────────────────────
  _startOnlineMode() {
    // Online mode uses its own fixed canvas dimensions; remove full-screen layout
    this.canvas.width  = ONLINE_COLS * ONLINE_GRID;
    this.canvas.height = ONLINE_ROWS * ONLINE_GRID;
    document.getElementById('app').classList.remove('game-fullscreen');
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
      <button class="btn btn-online" id="quick-play-btn">⚡ QUICK PLAY</button>
      <div class="online-sep">— or set up a private room —</div>
      <button class="btn btn-online" id="create-room-btn">CREATE ROOM</button>
      <div class="online-join-row">
        <input id="room-code-input" class="room-input" maxlength="4"
               placeholder="ABCD" autocomplete="off" spellcheck="false" />
        <button class="btn" id="join-room-btn">JOIN</button>
      </div>
      <div id="online-error" class="online-error"></div>
      <button class="btn btn-back" id="back-btn">← BACK</button>
    `;
    document.getElementById('quick-play-btn').addEventListener('click', () => this._quickPlay());
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

  _quickPlay() {
    this._connectWS(() => {
      this.isQuickPlay = true;  // set after _leaveOnline() runs inside _connectWS
      this.online.send(JSON.stringify({ type: 'quick_play' }));
      this._showQuickPlayWaiting();
    });
  }

  _showQuickPlayWaiting() {
    const el = document.getElementById('overlay');
    el.className = 'online';
    el.style.display = '';
    el.innerHTML = `
      <h1>QUICK PLAY</h1>
      <div class="info">Searching for an opponent…</div>
      <div id="online-error" class="online-error"></div>
      <button class="btn btn-back" id="back-btn">← CANCEL</button>
    `;
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
    this.isQuickPlay     = false;
    this.onlineIsBot     = false;
    this._hideMobileTeleportBtn();
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
        // In quick-play mode the waiting screen is already shown; don't switch to room-code screen
        if (!this.isQuickPlay) this._showOnlineWaiting();
        break;

      case 'room_joined':
        this.onlineRole     = msg.player;
        this.onlineRoomCode = msg.code;
        // Server will send game_start imminently
        break;

      case 'game_start':
        this.onlineState     = msg.state;
        this.onlineIsBot     = msg.isBot || false;
        this.prevOnlineState = null;
        this.lastOnlineTick  = performance.now();
        this.particles       = [];
        this._lastSentAngle  = undefined;
        this.phase           = 'online_playing';
        this._hideOverlay();
        this._showMobileTeleportBtn();
        this._updateOnlineHUD();
        break;

      case 'game_tick': {
        // Detect teleports: large position jump between ticks (> 2 grid cells = teleport)
        const TELEPORT_DIST_SQ = 4;
        if (this.onlineState && msg.state) {
          for (let pi = 0; pi < 2; pi++) {
            const prevSnake = this.onlineState.snakes[pi];
            const currSnake = msg.state.snakes[pi];
            if (prevSnake && currSnake && prevSnake.body.length && currSnake.body.length) {
              const deltaX = currSnake.body[0].x - prevSnake.body[0].x;
              const deltaY = currSnake.body[0].y - prevSnake.body[0].y;
              if (deltaX * deltaX + deltaY * deltaY > TELEPORT_DIST_SQ) {
                spawnParticles(this.particles, prevSnake.body[0].x, prevSnake.body[0].y, '#0cf', 16, ONLINE_GRID);
                spawnParticles(this.particles, currSnake.body[0].x, currSnake.body[0].y, '#0cf', 16, ONLINE_GRID);
              }
            }
          }
        }
        this.prevOnlineState = this.onlineState;
        this.onlineState     = msg.state;
        this.lastOnlineTick  = performance.now();
        this._lastSentAngle  = undefined; // re-evaluate mouse direction every tick
        this._updateOnlineHUD();
        break;
      }

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
    this._hideMobileTeleportBtn();
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
    this._hideMobileTeleportBtn();
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

  _showMobileTeleportBtn() {
    const wrap = document.getElementById('mobile-teleport-wrap');
    if (wrap) wrap.style.display = '';
    const gunArea = document.getElementById('gun-joystick-area');
    if (gunArea) gunArea.style.display = 'none';
  }

  _hideMobileTeleportBtn() {
    const wrap = document.getElementById('mobile-teleport-wrap');
    if (wrap) wrap.style.display = 'none';
    const gunArea = document.getElementById('gun-joystick-area');
    if (gunArea) gunArea.style.display = '';
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
    // Update mobile teleport button
    const mobileBtn = document.getElementById('mobile-teleport-btn');
    if (mobileBtn) {
      mobileBtn.textContent = charges > 0 ? `⌁ TELEPORT (${charges})` : '⌁ TELEPORT (0)';
      mobileBtn.disabled = charges <= 0;
    }
  }

  // ── Singleplayer session (admin observability) ──
  _connectSpSession() {
    // Close any existing SP session WebSocket before opening a new one
    this._disconnectSpSession();
    try {
      const ws = new WebSocket(WS_SERVER);
      this._spWs = ws;
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'sp_register', name: this._playerName || 'Anonymous' }));
      });
      ws.addEventListener('message', ev => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        this._handleSpCommand(msg);
      });
      ws.addEventListener('close', () => {
        if (this._spWs === ws) { this._spWs = null; this._spSessionId = null; }
      });
      ws.addEventListener('error', () => {
        if (this._spWs === ws) { this._spWs = null; this._spSessionId = null; }
      });
    } catch (_) { /* offline — ignore */ }
  }

  _disconnectSpSession() {
    if (this._spWs) {
      this._spWs.close();
      this._spWs = null;
    }
    this._spSessionId = null;
  }

  _handleSpCommand(msg) {
    if (msg.type === 'sp_registered') {
      this._spSessionId = msg.sessionId;
      return;
    }
    if (msg.type === 'sp_request_state') {
      // Admin requested a state snapshot — send current game state back
      if (this._spWs && this._spWs.readyState === WebSocket.OPEN) {
        const s = this.state;
        const snapshot = s ? {
          snake:      s.snake,
          snakeAngle: s.snakeAngle || 0,
          apples:     s.apples.map(a => ({ x: a.fx, y: a.fy, dropped: a.dropped })),
          enemies:    s.enemies.map(e => ({ x: e.x, y: e.y, type: e.type, id: e.id, hp: e.hp, maxHp: e.maxHp })),
          chests:     s.chests.map(c => ({ x: c.x, y: c.y, rarity: c.rarity, itemId: c.itemId })),
          bullets:    s.bullets.map(b => ({ x: b.x, y: b.y, life: b.life, maxLife: b.maxLife })),
          score:        s.score,
          shields:      s.shields,
          applesEaten:  s.applesEaten,
          nightmareMode: s.nightmareMode,
          phase:        this.phase,
          viewCols:     VIEW_COLS,
          viewRows:     VIEW_ROWS,
          tick:         this.tick,
        } : { phase: this.phase, viewCols: VIEW_COLS, viewRows: VIEW_ROWS };
        this._spWs.send(JSON.stringify({ type: 'sp_state_update', snapshot }));
      }
      return;
    }
    // All other commands require an active singleplayer game
    if (!this.state || this.phase !== 'playing') return;
    const state = this.state;
    const elapsedMs = performance.now() - this.gameStartTime;
    switch (msg.type) {
      case 'sp_spawn_enemy':
        spawnEnemy(state, elapsedMs);
        break;
      case 'sp_spawn_apple':
        for (let i = 0; i < 5; i++) spawnApple(state);
        break;
      case 'sp_spawn_chest':
        spawnChest(state);
        break;
      case 'sp_toggle_nightmare':
        state.nightmareMode = !state.nightmareMode;
        if (state.nightmareMode) {
          document.getElementById('app').classList.add('nightmare-mode');
          this._resizeCanvas(true);
        } else {
          document.getElementById('app').classList.remove('nightmare-mode');
          this._resizeCanvas(false);
        }
        this._updateHUD();
        break;
    }
  }

  // ── Admin panel ──────────────────────────────
  _setupAdmin() {
    // Admin open button
    const openBtn = document.getElementById('admin-open-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (this._adminMode) {
          this._openAdminPanel();
        } else {
          this._openAdminModal();
        }
      });
    }

    // Admin modal cancel
    const cancelBtn = document.getElementById('admin-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeAdminModal());

    // Admin login
    const loginBtn = document.getElementById('admin-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => this._submitAdminLogin());

    // Allow Enter key in password field
    const pwInput = document.getElementById('admin-pw-input');
    if (pwInput) pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._submitAdminLogin(); });

    // Admin panel close
    const closeBtn = document.getElementById('admin-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeAdminPanel());

    // Spectate overlay close
    const spectateClose = document.getElementById('spectate-close');
    if (spectateClose) spectateClose.addEventListener('click', () => this._stopSpectating());

    this._makePanelDraggable();

    // Admin action buttons
    const actions = {
      'adm-godmode': () => this._adminAction('godmode'),
      'adm-shield':  () => this._adminAction('shield'),
      'adm-apple':   () => this._adminAction('apple'),
      'adm-score':   () => this._adminAction('score'),
      'adm-speed':   () => this._adminAction('speed'),
      'adm-slow':    () => this._adminAction('slow'),
      'adm-clear':   () => this._adminAction('clear'),
      'adm-upgrade': () => this._adminAction('upgrade'),
      'adm-nightmare-toggle': () => this._adminAction('nightmaretoggle'),
    };
    for (const [id, handler] of Object.entries(actions)) {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', handler);
    }

    // Delegate click handler for leaderboard delete buttons (added once)
    const lbList = document.getElementById('adm-leaderboard-list');
    if (lbList) {
      lbList.addEventListener('click', e => {
        const btn = e.target.closest('.adm-del-btn');
        if (!btn) return;
        const name = btn.getAttribute('data-name');
        this._deleteLeaderboardEntry(name, btn);
      });
    }

    // Delegate click handler for nightmare leaderboard delete buttons
    const nmLbList = document.getElementById('adm-nm-leaderboard-list');
    if (nmLbList) {
      nmLbList.addEventListener('click', e => {
        const btn = e.target.closest('.adm-nm-del-btn');
        if (!btn) return;
        const name = btn.getAttribute('data-name');
        this._deleteNightmareLeaderboardEntry(name, btn);
      });
    }

    // Delegate click handler for singleplayer session action buttons
    const spList = document.getElementById('adm-sp-sessions-list');
    if (spList) {
      spList.addEventListener('click', e => {
        const spectateBtn = e.target.closest('.adm-sp-spectate-btn');
        if (spectateBtn) {
          const sid = spectateBtn.getAttribute('data-sid');
          const name = spectateBtn.getAttribute('data-name');
          this._spectateSession(sid, name);
          return;
        }
        const btn = e.target.closest('.adm-sp-btn');
        if (!btn) return;
        const sid = btn.getAttribute('data-sid');
        const cmd = btn.getAttribute('data-cmd');
        this._sendSpCommand(sid, cmd, btn);
      });
    }

    // Refresh button for SP sessions
    const spRefresh = document.getElementById('adm-sp-refresh');
    if (spRefresh) spRefresh.addEventListener('click', () => this._loadSpSessions());
  }

  _showAdminOpenBtn() {
    const btn = document.getElementById('admin-open-btn');
    if (btn) btn.style.display = '';
  }

  _openAdminModal() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    const pwInput = document.getElementById('admin-pw-input');
    if (pwInput) pwInput.value = '';
    const errEl = document.getElementById('admin-pw-error');
    if (errEl) errEl.textContent = '';
    modal.style.display = 'flex';
    if (pwInput) setTimeout(() => pwInput.focus(), 50);
  }

  _closeAdminModal() {
    const modal = document.getElementById('admin-modal');
    if (modal) modal.style.display = 'none';
  }

  _submitAdminLogin() {
    const pwInput = document.getElementById('admin-pw-input');
    const errEl   = document.getElementById('admin-pw-error');
    const password = pwInput ? pwInput.value : '';
    if (!password) { if (errEl) errEl.textContent = 'Enter a password.'; return; }

    fetch(`${API_SERVER}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.token) {
          this._adminMode  = true;
          this._adminToken = data.token;
          this._closeAdminModal();
          this._openAdminPanel();
        } else {
          if (errEl) errEl.textContent = 'Incorrect password.';
          if (pwInput) pwInput.value = '';
        }
      })
      .catch(() => {
        if (errEl) errEl.textContent = 'Server error. Try again.';
      });
  }

  _openAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) { panel.style.display = 'flex'; this._adminPanelOpen = true; }
    // Hide open button while panel is visible
    const openBtn = document.getElementById('admin-open-btn');
    if (openBtn) openBtn.style.display = 'none';
    // Load leaderboard entries with delete buttons
    this._loadAdminLeaderboard();
    this._loadAdminNightmareLeaderboard();
    // Load active singleplayer sessions
    this._loadSpSessions();
  }

  _closeAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) { panel.style.display = 'none'; this._adminPanelOpen = false; }
    // Show open button again whenever admin mode is active
    if (this._adminMode) {
      const openBtn = document.getElementById('admin-open-btn');
      if (openBtn) openBtn.style.display = '';
    }
  }

  _loadAdminLeaderboard() {
    const listEl = document.getElementById('adm-leaderboard-list');
    if (!listEl) return;
    listEl.textContent = 'Loading…';
    fetch(`${API_SERVER}/api/leaderboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data.entries || data.entries.length === 0) {
          listEl.textContent = 'No entries.';
          return;
        }
        listEl.innerHTML = data.entries.map(e => {
          const safeName = escapeHtml(e.name || 'Anonymous');
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px 0;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName} — ${e.score}</span>
            <button data-name="${safeName}" class="adm-del-btn" style="background:#1a0a0a;border:1px solid #644;color:#f64;font-family:'Courier New',monospace;font-size:9px;padding:2px 6px;cursor:pointer;border-radius:3px;flex-shrink:0;">✕</button>
          </div>`;
        }).join('');
      })
      .catch(() => { listEl.textContent = 'Unavailable'; });
  }

  _deleteLeaderboardEntry(name, btn) {
    if (!this._adminToken) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    fetch(`${API_SERVER}/api/admin/leaderboard/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken, name }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          this._loadAdminLeaderboard();
        } else {
          if (btn) { btn.disabled = false; btn.textContent = '✕'; }
        }
      })
      .catch(() => { if (btn) { btn.disabled = false; btn.textContent = '✕'; } });
  }

  _loadAdminNightmareLeaderboard() {
    const listEl = document.getElementById('adm-nm-leaderboard-list');
    if (!listEl) return;
    listEl.textContent = 'Loading…';
    fetch(`${API_SERVER}/api/nightmare-leaderboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data.entries || data.entries.length === 0) {
          listEl.textContent = 'No entries.';
          return;
        }
        listEl.innerHTML = data.entries.map(e => {
          const safeName = escapeHtml(e.name || 'Anonymous');
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px 0;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName} — ${e.score}</span>
            <button data-name="${safeName}" class="adm-nm-del-btn" style="background:#1a0a0a;border:1px solid #644;color:#f64;font-family:'Courier New',monospace;font-size:9px;padding:2px 6px;cursor:pointer;border-radius:3px;flex-shrink:0;">✕</button>
          </div>`;
        }).join('');
      })
      .catch(() => { listEl.textContent = 'Unavailable'; });
  }

  _deleteNightmareLeaderboardEntry(name, btn) {
    if (!this._adminToken) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    fetch(`${API_SERVER}/api/admin/nightmare-leaderboard/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken, name }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          this._loadAdminNightmareLeaderboard();
        } else {
          if (btn) { btn.disabled = false; btn.textContent = '✕'; }
        }
      })
      .catch(() => { if (btn) { btn.disabled = false; btn.textContent = '✕'; } });
  }

  _loadSpSessions() {
    const listEl = document.getElementById('adm-sp-sessions-list');
    if (!listEl || !this._adminToken) return;
    listEl.textContent = 'Loading…';
    fetch(`${API_SERVER}/api/admin/sp-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data.sessions || data.sessions.length === 0) {
          listEl.textContent = 'No active sessions.';
          return;
        }
        const baseBtn = 'font-family:\'Courier New\',monospace;font-size:9px;padding:2px 5px;cursor:pointer;border-radius:3px;';
        const btnStyle = `background:#0a1a1a;border:1px solid #246;color:#7cf;${baseBtn}`;
        const spectateStyle = `background:#0a1a0a;border:1px solid #264;color:#7fc;${baseBtn}`;
        listEl.innerHTML = data.sessions.map(s => {
          const safeName = escapeHtml(s.playerName);
          const mins = Math.floor(s.elapsedSec / 60);
          const secs = String(s.elapsedSec % 60).padStart(2, '0');
          return `<div style="border:1px solid #234;padding:4px 5px;margin-bottom:4px;border-radius:3px;">
            <div style="font-size:10px;color:#7ab;margin-bottom:3px;">${safeName} — ${mins}:${secs}</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px;">
              <button class="adm-sp-spectate-btn" data-sid="${s.sessionId}" data-name="${safeName}" style="${spectateStyle}">👁 Spectate</button>
              <button class="adm-sp-btn" data-sid="${s.sessionId}" data-cmd="sp_spawn_enemy" style="${btnStyle}">👾 Enemy</button>
              <button class="adm-sp-btn" data-sid="${s.sessionId}" data-cmd="sp_spawn_apple" style="${btnStyle}">🍎 Apples</button>
              <button class="adm-sp-btn" data-sid="${s.sessionId}" data-cmd="sp_spawn_chest" style="${btnStyle}">🎁 Chest</button>
              <button class="adm-sp-btn" data-sid="${s.sessionId}" data-cmd="sp_toggle_nightmare" style="${btnStyle}">☠ Nightmare</button>
            </div>
          </div>`;
        }).join('');
      })
      .catch(() => { listEl.textContent = 'Unavailable'; });
  }

  _sendSpCommand(sessionId, command, btn) {
    if (!this._adminToken) return;
    if (btn) { btn.disabled = true; }
    fetch(`${API_SERVER}/api/admin/sp-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken, sessionId, command }),
    })
      .then(r => r.json())
      .then(() => { if (btn) { btn.disabled = false; } })
      .catch(() => { if (btn) { btn.disabled = false; } });
  }

  _spectateSession(sessionId, playerName) {
    this._stopSpectating();
    this._spectateSessionId = sessionId;

    const overlay = document.getElementById('spectate-overlay');
    const nameEl  = document.getElementById('spectate-player-name');
    const statsEl = document.getElementById('spectate-stats');
    if (!overlay) return;
    if (nameEl) nameEl.textContent = playerName || sessionId;
    if (statsEl) statsEl.textContent = '';
    overlay.style.display = 'flex';

    const poll = () => {
      if (!this._spectateSessionId) return;
      fetch(`${API_SERVER}/api/admin/sp-spectate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this._adminToken, sessionId: this._spectateSessionId }),
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          if (!this._spectateSessionId) return;
          if (data.ok && data.snapshot) {
            this._renderSpectateCanvas(data.snapshot);
          }
        })
        .catch(() => {});
    };

    poll();
    this._spectateInterval = setInterval(poll, SPECTATE_POLL_INTERVAL_MS);
  }

  _stopSpectating() {
    if (this._spectateInterval) {
      clearInterval(this._spectateInterval);
      this._spectateInterval = null;
    }
    this._spectateSessionId = null;
    const overlay = document.getElementById('spectate-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _renderSpectateCanvas(snapshot) {
    const canvas = document.getElementById('spectate-canvas');
    const statsEl = document.getElementById('spectate-stats');
    if (!canvas) return;

    const cols = snapshot.viewCols || 30;
    const rows = snapshot.viewRows || 30;
    const cw = cols * GRID;
    const ch = rows * GRID;

    // Resize canvas to match the player's actual game resolution
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, cw, ch);

    // If no active game state, show a placeholder
    if (!snapshot.snake || !snapshot.snake.length) {
      ctx.fillStyle = '#446';
      ctx.font = '14px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(snapshot.phase === 'upgrade' ? '[ UPGRADE SCREEN ]' : '[ WAITING FOR GAME ]', cw / 2, ch / 2);
      ctx.textBaseline = 'alphabetic';
      if (statsEl) statsEl.textContent = snapshot.phase ? `Phase: ${snapshot.phase}` : '';
      return;
    }

    // Temporarily override view globals so the shared drawGrid helper knows how
    // many cells to render.  This is safe: JS is single-threaded and this entire
    // block executes synchronously, so the game-loop rAF callback cannot interleave.
    const savedCols = VIEW_COLS;
    const savedRows = VIEW_ROWS;
    VIEW_COLS = cols;
    VIEW_ROWS = rows;
    try {
      // Apply the same camera transform the player's game uses: centre on snake head
      const camX = snapshot.snake[0].x;
      const camY = snapshot.snake[0].y;
      ctx.save();
      ctx.translate(cw / 2 - camX * GRID, ch / 2 - camY * GRID);

      drawGrid(ctx, camX, camY);

      const tick = snapshot.tick || 0;
      const pseudoState = {
        snake:      snapshot.snake,
        snakeAngle: snapshot.snakeAngle || 0,
        shields:    snapshot.shields || 0,
        apples:     snapshot.apples   || [],
        enemies:    snapshot.enemies  || [],
        chests:     snapshot.chests   || [],
        bullets:    snapshot.bullets  || [],
      };

      drawApples(ctx, pseudoState, tick);
      drawChests(ctx, pseudoState, tick);
      drawBullets(ctx, pseudoState.bullets);
      drawSnake(ctx, pseudoState);
      drawEnemies(ctx, pseudoState, tick);

      ctx.restore();
    } finally {
      // Always restore view globals even if drawing throws
      VIEW_COLS = savedCols;
      VIEW_ROWS = savedRows;
    }

    // Update stats bar
    if (statsEl) {
      const score  = snapshot.score  || 0;
      const shields = snapshot.shields || 0;
      const apples = snapshot.applesEaten || 0;
      const nm     = snapshot.nightmareMode ? ' ☠' : '';
      const upg    = snapshot.phase === 'upgrade' ? ' · CHOOSING UPGRADE' : '';
      statsEl.textContent = `Score: ${score}  ·  🛡 ${shields}  ·  🍎 ${apples}${nm}${upg}`;
    }
  }

  _checkRemovalNotice() {
    const name = this._playerName;
    if (!name) return;
    fetch(`${API_SERVER}/api/leaderboard/check-removal?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data.removed) return;
        // Only show if this specific removal hasn't been acknowledged yet
        const storageKey = 'removalNoticeAckedAt_' + name;
        let ackedAt;
        try { ackedAt = localStorage.getItem(storageKey); } catch(_) {}
        const removedAt = data.removedAt ? String(data.removedAt) : '';
        if (ackedAt && ackedAt === removedAt) return; // already acknowledged this removal
        const notice = document.getElementById('removal-notice');
        if (notice && notice.style.display === 'flex') return; // already shown, listener already attached
        if (notice) notice.style.display = 'flex';
        const okBtn = document.getElementById('removal-notice-ok');
        if (okBtn) {
          okBtn.addEventListener('click', () => {
            if (notice) notice.style.display = 'none';
            try { localStorage.setItem(storageKey, removedAt); } catch(_) {}
          }, { once: true });
        }
      })
      .catch(() => {}); // silently ignore if server unavailable
  }

  _adminAction(action) {
    // Apply debug actions to the current game state (solo or online)
    const s = this.state;
    switch (action) {
      case 'godmode':
        if (s) {
          s.ghost = (s.ghost || 0) ? 0 : 1;
          s.shields = s.ghost ? 99 : s.shields;
          this._flashAdminBtn('adm-godmode', s.ghost ? '👻 God Mode ON' : '👻 God Mode OFF');
        }
        break;
      case 'shield':
        if (s) { s.shields = Math.min(99, (s.shields || 0) + 1); this._updateHUD(); }
        break;
      case 'apple':
        if (s) {
          for (let i = 0; i < 5; i++) spawnApple(s);
        }
        break;
      case 'score':
        if (s) { s.score = (s.score || 0) + 500; this._updateHUD(); }
        break;
      case 'speed':
        if (s) { s.baseInterval = Math.max(40, (s.baseInterval || 140) - 20); }
        break;
      case 'slow':
        if (s) { s.baseInterval = Math.min(400, (s.baseInterval || 140) + 20); }
        break;
      case 'clear':
        if (s && s.enemies) { s.enemies = []; }
        break;
      case 'upgrade':
        if (s && (this.phase === 'playing' || this.phase === 'upgrade')) {
          this._triggerUpgradeChoice();
        }
        break;
      case 'nightmaretoggle': {
        const nowUnlocked = isNightmareUnlocked();
        if (nowUnlocked) {
          clearNightmareUnlocked();
          this._flashAdminBtn('adm-nightmare-toggle', '☠ Nightmare LOCKED');
        } else {
          setNightmareUnlocked();
          this._flashAdminBtn('adm-nightmare-toggle', '☠ Nightmare UNLOCKED');
        }
        break;
      }
    }
  }

  _flashAdminBtn(id, text) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  _makePanelDraggable() {
    const panel  = document.getElementById('admin-panel');
    const handle = document.getElementById('admin-panel-title');
    if (!panel || !handle) return;
    let dragging = false, offsetX = 0, offsetY = 0;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      panel.style.bottom = '';
      panel.style.right  = '';
      panel.style.top    = rect.top  + 'px';
      panel.style.left   = rect.left + 'px';
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      dragging = true;
      handle.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      let nx = e.clientX - offsetX;
      let ny = e.clientY - offsetY;
      nx = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  nx));
      ny = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ny));
      panel.style.left = nx + 'px';
      panel.style.top  = ny + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; handle.style.cursor = 'grab'; }
    });
  }

  _triggerUpgradeChoice() {
    if (!this.state) return;
    const s = this.state;
    const pool = UPGRADES.filter(u => !u.oneTime || !s.upgradeCount[u.id]);
    const choices = pickRandom(pool, s.oracle ? 4 : 3);
    if (!choices.length) return;
    this.pendingUpgrades = choices;
    this.phase = 'upgrade';
    this._showUpgradePanel();
  }
}

// ── Boot ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new SnakeRogue();
});
