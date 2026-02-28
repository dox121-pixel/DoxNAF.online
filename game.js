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

// ── Bat (chaser enemy) sprites ────────────────
const BAT_IMG = new Image();
BAT_IMG.src = 'sprites/BAT.png';
const BAT_FLAP_IMG = new Image();
BAT_FLAP_IMG.src = 'sprites/BATFLAP.png';

// ── Ghost (phantom enemy) sprites ────────────
const GHOST_OPEN_IMG = new Image();
GHOST_OPEN_IMG.src = 'sprites/GHOSTOPEN.png';
const GHOST_CLOSE_IMG = new Image();
GHOST_CLOSE_IMG.src = 'sprites/GHOSTCLOSE.png';

// ── Ward / Heart HUD sprites ──────────────────
const WARD_PERK_ID = 'shield'; // upgrade id for the WARD perk (shown as a health stat, not a perk)
const WARD_IMG = new Image();
WARD_IMG.src = 'sprites/WARD.png';
const HEART_IMG = new Image();
HEART_IMG.src = 'sprites/HEART.png';
const HEART_EMPTY_IMG = new Image();
HEART_EMPTY_IMG.src = 'sprites/HEARTEMPTY.png';

// ── Snake sprites ─────────────────────────────
const SNAKE_HEAD_IMG = new Image();
SNAKE_HEAD_IMG.src = 'sprites/SNAKEHEAD.png';
const SNAKE_BODY_IMGS = [new Image(), new Image(), new Image(), new Image()];
SNAKE_BODY_IMGS[0].src = 'sprites/SNAKEBODY.png';
SNAKE_BODY_IMGS[1].src = 'sprites/SNAKEBODY1.png';
SNAKE_BODY_IMGS[2].src = 'sprites/SNAKEBODY2.png';
SNAKE_BODY_IMGS[3].src = 'sprites/SNAKEBODY3.png';
const SNAKE_TAIL_IMG = new Image();
SNAKE_TAIL_IMG.src = 'sprites/SNAKETAIL.png';
const SNAKE_HEAD_BORDER_IMG = new Image();
SNAKE_HEAD_BORDER_IMG.src = 'sprites/SNAKEHEADBORDER.png';
const SNAKE_BODY_BORDER_IMG = new Image();
SNAKE_BODY_BORDER_IMG.src = 'sprites/SNAKEBODYBORDER.png';
const SNAKE_TAIL_BORDER_IMG = new Image();
SNAKE_TAIL_BORDER_IMG.src = 'sprites/SNAKETAILBORDER.png';

// ── Inline red apple img tag for HTML contexts ─
const APPLE_SPRITE_TAG = '<img src="sprites/APPLER.png" style="width:14px;height:14px;vertical-align:middle;display:inline-block;">';

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
const SEG_SPACING            = 0.45;        // grid-cells between body segment points
const SNAKE_RADIUS           = 0.30;        // grid-cells half-width (rendering + collision)
const SNAKE_SPRITE_SIZE_MULT  = 3.5;        // multiplier for snake sprite draw size relative to radius
const SNAKE_SPRITE_ROT_OFFSET = Math.PI / 2; // sprites face up; offset aligns them with movement direction
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
    icon: '<img src="sprites/WARD.png" style="width:48px;height:48px;vertical-align:middle;display:inline-block;">',
    desc: 'Survive one fatal hit. One stack only.',
    apply(state) { state.shields = Math.min(1, (state.shields || 0) + 1); }
  },
  {
    id: 'freeze',
    name: 'ICEFIELD',
    icon: '❄️',
    desc: 'All enemies slowed. Stacks.',
    apply(state) { state.freeze = (state.freeze || 0) + 1; }
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
    apply(state) { state.appleEatDist = (state.appleEatDist || APPLE_EAT_DIST) + 0.4; }
  },
  {
    id: 'bullet_range',
    name: 'LONG RANGE',
    icon: '🎯',
    desc: 'Bullets travel farther. Stack to reach across the map.',
    apply(state) { state.bulletRange = (state.bulletRange || 1) + 0.4; }
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
    id: 'swift_boots', rarity: 'common',
    name: 'SWIFT BOOTS', icon: '💨',
    desc: 'Move permanently faster.',
    apply(state) { state.baseInterval = Math.max(80, state.baseInterval - 15); }
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
    id: 'marksman', rarity: 'rare',
    name: 'MARKSMAN', icon: '🎯',
    desc: '+5 bullet damage and greatly extended bullet range.',
    apply(state) {
      state.bulletDamage = (state.bulletDamage || 2) + 5;
      state.bulletRange = (state.bulletRange || 1) + 1.5;
    }
  },
  // Epic
  {
    id: 'omega_pulse', rarity: 'epic',
    name: 'OMEGA PULSE', icon: '💫',
    desc: 'PULSE ×5 — massive blast on apple pickup.',
    apply(state) { state.pulse = (state.pulse || 0) + 5; }
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
      state.enemyKills = (state.enemyKills || 0) + state.enemies.length;
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
  return String(str).replace(/[<>&"'`]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;','\'':'&#x27;','`':'&#x60;'}[c]));
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

function isEnclosedBySnake(state, cell) {
  const snakeSet = new Set(state.snake.map(s => `${Math.round(s.x)},${Math.round(s.y)}`));
  const sx = Math.round(cell.x);
  const sy = Math.round(cell.y);
  if (snakeSet.has(`${sx},${sy}`)) return true;
  const visited = new Set();
  const queue = [[sx, sy]];
  visited.add(`${sx},${sy}`);
  const MAX_CELLS = 2000;
  while (queue.length > 0) {
    if (visited.size >= MAX_CELLS) return false;
    const [cx, cy] = queue.shift();
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const key = `${nx},${ny}`;
      if (!visited.has(key) && !snakeSet.has(key)) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return true;
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
    (state.chests || []).some(c => Math.abs(c.x - cell.x) < 0.5 && Math.abs(c.y - cell.y) < 0.5) ||
    isEnclosedBySnake(state, cell)
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
    ctx.shadowBlur = _fxEnabled ? 24 : 0;
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
    ctx.shadowBlur = _fxEnabled ? 6 : 0;
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
  // Filter out one-time upgrades the player already owns,
  // and WARD while it is currently active
  const available = UPGRADES.filter(u => {
    if (u.oneTime && state.upgradeCount[u.id]) return false;
    if (u.id === WARD_PERK_ID && (state.shields || 0) > 0) return false;
    return true;
  });

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
    size: 1.8,
    shape: 'bat',
    speed: 0.0050,
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
    speed: 0.0015,
    score: 8,
    maxHp: 4,
    label: 'PATROLLER',
    init(e) {
      e.angle = Math.random() * Math.PI * 2;
      e.turnTimer = 0;
      e.charging = false;
      e.chargeShield = false;
    },
    update(e, state, dt) {
      const head = state.snake[0];
      const dx = head.x - e.x;
      const dy = head.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const spd = e.speed * dt * (1 / (1 + (state.freeze || 0) * 0.25));
      // Trigger charge when player gets close
      if (!e.charging && dist < 20) {
        e.charging = true;
        e.chargeShield = true;
      }
      if (e.charging) {
        const len = dist || 1;
        e.x += (dx / len) * spd * 8;
        e.y += (dy / len) * spd * 8;
        e.angle = Math.atan2(dy, dx);
      } else {
        e.turnTimer = (e.turnTimer || 0) + dt;
        if (e.turnTimer > 3000 + randInt(3000)) {
          e.angle += (Math.random() - 0.5) * Math.PI * 1.5;
          e.turnTimer = 0;
        }
        e.x += Math.cos(e.angle) * spd;
        e.y += Math.sin(e.angle) * spd;
      }
    }
  },
  phantom: {
    color: 'rgba(180,200,255,0.85)',
    glowColor: 'rgba(160,180,255,0.6)',
    size: 1.5,
    shape: 'ghost',
    speed: 0.0110,
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
    speed: 0.0035,
    score: 30,
    maxHp: 60,
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
};

// ── Time-based enemy scaling ─────────────────
function getTargetEnemyCount(elapsedMs, nightmareMode) {
  const s = elapsedMs / 1000;
  let count;
  if      (s < 30)  count = 3;
  else if (s < 60)  count = 10;
  else if (s < 90)  count = 20;
  else if (s < 150) count = 40;
  else              count = Math.floor(40 + (s - 150) / 30 * 12);
  return nightmareMode ? Math.floor(count * 3) : count;
}

function getEnemyTypeKeys(elapsedMs, nightmareMode) {
  const s = elapsedMs / 1000;
  // Only bats (chasers) until 2:45; then one new enemy type unlocks every minute
  const keys = ['chaser', 'chaser', 'chaser'];
  if (s >= 165 || nightmareMode) keys.push('patrol');
  if (s >= 285 || nightmareMode) keys.push('phantom');
  if (s >= 345 || nightmareMode) keys.push('titan');
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
    // Spawn at a random angle all around the player to prevent running away
    const angle = Math.random() * Math.PI * 2;
    const dist = spawnRange + Math.random() * 3;
    pos = { x: head.x + Math.cos(angle) * dist, y: head.y + Math.sin(angle) * dist };
    attempts++;
  } while ((
    Math.abs(pos.x - head.x) + Math.abs(pos.y - head.y) < 8 ||
    state.snake.some(s => { const bx = pos.x - s.x, by = pos.y - s.y; return bx * bx + by * by < 4; })
  ) && attempts < 50);

  // HP scales up by +0.35 every 30 seconds
  const hpBonus = Math.floor(elapsedMs / 30000) * 0.35;
  const baseHp = (type.maxHp || 1) + hpBonus;
  const enemy = {
    x: pos.x, y: pos.y,
    type: typeKey,
    speed: type.speed * (state.nightmareMode ? 2.0 : 1.0),
    hp: baseHp,
    maxHp: baseHp,
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

  const ang = state.snakeAngle || 0;
  const sprSize = SNAKE_RADIUS * 2 * GRID * SNAKE_SPRITE_SIZE_MULT; // sprite draw size per segment

  ctx.save();

  // Sample segment positions every ~1 grid cell along the snake path
  // samples[0] = 0 (head), samples[last] = tail
  const step = Math.max(1, Math.round(1 / SEG_SPACING));
  const samples = [];
  for (let i = 0; i < snake.length; i += step) {
    samples.push(i);
  }
  if (samples[samples.length - 1] !== snake.length - 1) {
    samples.push(snake.length - 1);
  }

  // Pre-compute per-sample cx/cy/angle
  const sampleData = samples.map((idx) => {
    const seg = snake[idx];
    const prevSeg = snake[Math.max(0, idx - 1)];
    return {
      idx,
      cx: seg.x * GRID + GRID / 2,
      cy: seg.y * GRID + GRID / 2,
      angle: Math.atan2(prevSeg.y - seg.y, prevSeg.x - seg.x),
    };
  });

  // Draw each body segment (fill then border) from tail → neck so segments
  // closer to the head are fully on top of those farther away.
  for (let si = samples.length - 1; si >= 1; si--) {
    const { idx, cx, cy, angle: segAngle } = sampleData[si];

    // Body segments cycle through Body1, Body2, Body3 (indices 1-3)
    const img = SNAKE_BODY_IMGS[1 + (idx % 3)];

    const snakeColor = `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`;
    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(segAngle + SNAKE_SPRITE_ROT_OFFSET);
      drawTintedSprite(ctx, img, -sprSize / 2, -sprSize / 2, sprSize, sprSize, snakeColor);
      ctx.restore();
    } else {
      // Fallback: coloured circle while sprites load
      const alpha = 0.35 + 0.65 * (1 - idx / snake.length);
      ctx.fillStyle = `hsla(${_snakeHue}, 70%, ${_snakeBrightness}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, SNAKE_RADIUS * GRID, 0, Math.PI * 2);
      ctx.fill();
    }

    if (SNAKE_BODY_BORDER_IMG.complete && SNAKE_BODY_BORDER_IMG.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(segAngle + SNAKE_SPRITE_ROT_OFFSET);
      drawTintedSprite(ctx, SNAKE_BODY_BORDER_IMG, -sprSize / 2, -sprSize / 2, sprSize, sprSize, snakeColor);
      ctx.restore();
    }
  }

  // ── Draw head fill sprite on top
  {
    const hx = snake[0].x * GRID + GRID / 2;
    const hy = snake[0].y * GRID + GRID / 2;
    if (SNAKE_HEAD_IMG.complete && SNAKE_HEAD_IMG.naturalWidth > 0) {
      ctx.save();
      ctx.shadowBlur  = _fxEnabled ? 14 : 0;
      ctx.shadowColor = (state.shields > 0) ? '#4af' : `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`;
      ctx.translate(hx, hy);
      ctx.rotate(ang + SNAKE_SPRITE_ROT_OFFSET);
      drawTintedSprite(ctx, SNAKE_HEAD_IMG, -sprSize / 2, -sprSize / 2, sprSize, sprSize, `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Fallback: circle while sprite loads
      const headColor = (state.shields > 0) ? '#66b8ff' : `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`;
      const glowColor = (state.shields > 0) ? '#4af'     : `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`;
      const hr = SNAKE_RADIUS * GRID * 1.25;
      ctx.shadowBlur  = _fxEnabled ? 14 : 0;
      ctx.shadowColor = glowColor;
      ctx.fillStyle   = headColor;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Draw head border on top of head fill
  {
    const hx = snake[0].x * GRID + GRID / 2;
    const hy = snake[0].y * GRID + GRID / 2;
    if (SNAKE_HEAD_BORDER_IMG.complete && SNAKE_HEAD_BORDER_IMG.naturalWidth > 0) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang + SNAKE_SPRITE_ROT_OFFSET);
      drawTintedSprite(ctx, SNAKE_HEAD_BORDER_IMG, -sprSize / 2, -sprSize / 2, sprSize, sprSize, `hsl(${_snakeHue}, 70%, ${_snakeBrightness}%)`);
      ctx.restore();
    }
  }

  // Cute pistol held in snake's mouth (extends forward from head)
  {
    const hx = snake[0].x * GRID + GRID / 2;
    const hy = snake[0].y * GRID + GRID / 2;
    const hr = SNAKE_RADIUS * GRID * 1.25;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    const gx = hr * 0.75;          // start just in front of head centre
    const gl = hr * 1.9;           // barrel length
    const gh = hr * 0.28;          // barrel height
    // Barrel
    ctx.fillStyle = '#8a8aaa';
    ctx.shadowBlur = _fxEnabled ? 5 : 0;
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
  }

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
      ctx.shadowBlur = _fxEnabled ? 14 : 0;
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

      ctx.shadowBlur = _fxEnabled ? 14 : 0;
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
      ctx.shadowBlur = _fxEnabled ? 18 : 0;
      ctx.shadowColor = '#0af';
      ctx.drawImage(TELEPORT_PERK_IMG, cx - size / 2, cy - size / 2, size, size);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Fallback: canvas drawing while sprite loads
      ctx.shadowBlur = _fxEnabled ? 18 : 0;
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

    ctx.shadowBlur = _fxEnabled ? 16 : 0;
    ctx.shadowColor = type.glowColor;
    ctx.fillStyle = type.color;

    if (type.shape === 'bat') {
      const batFrame = Math.floor(tick / 15) % 2 === 0 ? BAT_IMG : BAT_FLAP_IMG;
      const batImgReady = batFrame.complete && batFrame.naturalWidth > 0;
      if (batImgReady) {
        ctx.save();
        ctx.translate(cx, cy);
        const bSize = GRID * 1.2 * 0.45 * 6.5;
        ctx.shadowBlur = _fxEnabled ? 16 : 0;
        ctx.shadowColor = type.glowColor;
        ctx.drawImage(batFrame, -bSize / 2, -bSize / 2, bSize, bSize);
        ctx.restore();
        // Health bar
        const maxHp2 = e.maxHp || 1;
        if (e.hp < maxHp2) {
          const barW = r * 2.4, barH = 3;
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#400';
          ctx.fillRect(cx - barW / 2, cy - r - 7, barW, barH);
          const hpFrac2 = Math.max(0, e.hp / maxHp2);
          ctx.fillStyle = hpFrac2 > 0.5 ? '#4f4' : hpFrac2 > 0.25 ? '#ff4' : '#f44';
          ctx.fillRect(cx - barW / 2, cy - r - 7, barW * hpFrac2, barH);
        }
        ctx.shadowBlur = 0;
        continue;
      }
      // Fallback to circle if sprite not loaded
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (type.shape === 'circle') {
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
      const ghostFrame = Math.floor(tick / 20) % 2 === 0 ? GHOST_OPEN_IMG : GHOST_CLOSE_IMG;
      const ghostImgReady = ghostFrame.complete && ghostFrame.naturalWidth > 0;
      if (ghostImgReady) {
        ctx.save();
        ctx.translate(cx, cy);
        const gSize = GRID * 1.2 * 0.45 * 5.5; // slightly smaller than bat (bat uses 6.5)
        ctx.globalAlpha = 0.70 + 0.12 * Math.sin(tick * 0.07 + e.id * 5);
        ctx.shadowBlur = _fxEnabled ? 16 : 0;
        ctx.shadowColor = type.glowColor;
        ctx.drawImage(ghostFrame, -gSize / 2, -gSize / 2, gSize, gSize);
        ctx.globalAlpha = 1;
        ctx.restore();
        // Health bar
        const maxHp2 = e.maxHp || 1;
        if (e.hp < maxHp2) {
          const barW = r * 2.4, barH = 3;
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#400';
          ctx.fillRect(cx - barW / 2, cy - r - 7, barW, barH);
          const hpFrac2 = Math.max(0, e.hp / maxHp2);
          ctx.fillStyle = hpFrac2 > 0.5 ? '#4f4' : hpFrac2 > 0.25 ? '#ff4' : '#f44';
          ctx.fillRect(cx - barW / 2, cy - r - 7, barW * hpFrac2, barH);
        }
        ctx.shadowBlur = 0;
        continue;
      }
      // Fallback to shape if sprite not loaded
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

    // Charge shield visual (glowing ring around the enemy)
    if (e.chargeShield) {
      ctx.shadowBlur = _fxEnabled ? 20 : 0;
      ctx.shadowColor = 'rgba(136,136,255,0.9)';
      ctx.strokeStyle = `rgba(180,180,255,${0.7 + 0.3 * Math.sin(tick * 0.15 + e.id * 3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
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
    ctx.shadowBlur = _fxEnabled ? 8 : 0;
    ctx.shadowColor = '#ff0';
    ctx.fillStyle = '#ffe040';
    ctx.beginPath();
    ctx.arc(b.x * grid + grid / 2, b.y * grid + grid / 2, grid * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

let _particleQualityMult = 1.0; // controlled by graphics settings
let _fxEnabled = true;          // master special-effects toggle

// ── Snake colour customisation ────────────────
let _snakeHue        = 120; // 0-359 (default soft green)
let _snakeBrightness = 55;  // 20-80 percentage

// Offscreen canvas used for per-sprite colour tinting
const _tintCanvas = document.createElement('canvas');
const _tintCtx    = _tintCanvas.getContext('2d');

// Tint a white sprite with the current snake colour.
// The transform on `ctx` (translate/rotate) is already applied by the caller;
// x/y/w/h are in that local coordinate space.
function drawTintedSprite(ctx, img, x, y, w, h, color) {
  const cw = Math.ceil(w), ch = Math.ceil(h);
  if (_tintCanvas.width  < cw) _tintCanvas.width  = cw;
  if (_tintCanvas.height < ch) _tintCanvas.height = ch;
  _tintCtx.clearRect(0, 0, cw, ch);
  _tintCtx.drawImage(img, 0, 0, cw, ch);
  _tintCtx.globalCompositeOperation = 'multiply';
  _tintCtx.fillStyle = color;
  _tintCtx.fillRect(0, 0, cw, ch);
  _tintCtx.globalCompositeOperation = 'destination-in';
  _tintCtx.drawImage(img, 0, 0, cw, ch);
  _tintCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(_tintCanvas, 0, 0, cw, ch, x, y, w, h);
}

function spawnParticles(particles, x, y, color, count, grid = GRID) {
  const n = Math.round(count * _particleQualityMult);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
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
  const snakeR    = 0.42; // same ratio as single-player SNAKE_RADIUS

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
  ctx.shadowBlur  = _fxEnabled ? 14 : 0;
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
    this._paused = false;
    this._pausedAt = 0;
    this._totalPausedMs = 0;

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
    this._playerName = ''; // name comes from account; Anonymous if not logged in
    try { this._guiScale = parseFloat(localStorage.getItem('guiScale')) || 1.0; }
    catch(_) { this._guiScale = 1.0; }
    try { this._fpsCap = parseInt(localStorage.getItem('fpsCap'), 10) || 0; }
    catch(_) { this._fpsCap = 0; }
    try { this._particleQuality = localStorage.getItem('particleQuality') || 'full'; }
    catch(_) { this._particleQuality = 'full'; }
    try { this._fxEnabled = localStorage.getItem('fxEnabled') !== 'false'; }
    catch(_) { this._fxEnabled = true; }
    try { this._autoAim = localStorage.getItem('autoAim') !== 'false'; }
    catch(_) { this._autoAim = true; }
    try {
      const h = parseInt(localStorage.getItem('snakeHue'), 10);
      _snakeHue = isNaN(h) ? 120 : Math.min(359, Math.max(0, h));
    } catch(_) { _snakeHue = 120; }
    try {
      const b = parseInt(localStorage.getItem('snakeBrightness'), 10);
      _snakeBrightness = isNaN(b) ? 55 : Math.min(80, Math.max(20, b));
    } catch(_) { _snakeBrightness = 55; }
    this._applyFxSettings();

    // ── Admin state ──────────────────────────
    this._adminToken = null;
    this._adminPanelOpen = false;
    this._siteDown   = false;
    this._siteDownTimer = null;
    this._sleepSnakeRaf = null;
    this._siteGoingDown = false;
    this._siteDownSince = null;
    this._siteDownJumpscareTimer = null;
    this._sitePollingInterval = null;
    this._debugUsed = false;
    this._debugShowEncircle = false;
    this._lastDebugUpdate = 0;
    this._setupAdmin();
    this._setupFeedback();

    // ── User account state ────────────────────
    this._authToken       = null;
    this._accountUsername = null;
    this._authCurrentTab  = 'login';
    this._setupAuth();

    // ── Singleplayer session (admin observability + anti-cheat score tracking) ──
    this._spWs             = null;
    this._spSessionId      = null;
    this._submittedSessionId = null; // sessionId captured at game-over for score submission
    this._lastTrackedScore  = 0;    // last score delta sent to server
    this._lastTrackedApples = 0;    // last applesEaten delta sent to server
    this._lastTrackedKills  = 0;    // last enemyKills delta sent to server

    // ── Admin spectate state ──
    this._spectateSessionId = null;
    this._spectateInterval  = null;

    // ── Death replay buffer ──────────────────
    this._replayBuffer       = [];  // rolling 5-second snapshot buffer
    this._deathReplay        = null; // snapshot array for active death replay
    this._deathReplayStart   = 0;   // performance.now() when replay playback began
    this._deathReplayReason  = '';  // death reason carried across replay

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
    this._checkSiteState();
    this._sitePollingInterval = setInterval(() => this._checkSiteState(true), 30000);
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
      this.canvas.style.width  = '';
      this.canvas.style.height = '';
      document.getElementById('app').classList.remove('game-fullscreen');
    } else {
      const scale = this._guiScale || 1.0;
      VIEW_COLS = Math.max(10, Math.floor(window.innerWidth  / GRID / scale));
      VIEW_ROWS = Math.max(10, Math.floor(window.innerHeight / GRID / scale));
      W = VIEW_COLS * GRID;
      H = VIEW_ROWS * GRID;
      this.canvas.width  = W;
      this.canvas.height = H;
      this.canvas.style.width  = window.innerWidth  + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
      document.getElementById('app').classList.add('game-fullscreen');
    }
    this._applyGuiScaleToUI();
  }

  _applyGuiScaleToUI() {
    const scale = this._guiScale || 1.0;
    for (const id of ['overlay', 'hud', 'upgrade-panel']) {
      const el = document.getElementById(id);
      if (el) el.style.zoom = scale;
    }
  }

  _applyParticleQuality() {
    const q = this._particleQuality || 'full';
    _particleQualityMult = q === 'off' ? 0 : q === 'reduced' ? 0.4 : 1.0;
  }

  _applyFxSettings() {
    _fxEnabled = this._fxEnabled !== false;
    // When all effects are disabled, also kill particles
    if (!_fxEnabled) _particleQualityMult = 0;
    else this._applyParticleQuality();
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
      // Allow skipping the death replay back to the death screen
      if (this.phase === 'death_replay' && (e.key === 'Enter' || e.key === 'r' || e.key === ' ')) {
        this.phase = 'gameover';
        document.getElementById('overlay').style.display = '';
      }
      // ESC: toggle pause menu in solo mode only (not online, not nightmare)
      if (e.key === 'Escape' && !this.online && (this.phase === 'playing' || this._paused) && !(this.state && this.state.nightmareMode)) {
        if (this._paused) this._resumeGame(); else this._openPauseMenu();
      }
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
        if (this.phase === 'death_replay') {
          this.phase = 'gameover';
          document.getElementById('overlay').style.display = '';
          return;
        }
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

    // ── Pause button ──────────────────────────────
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        if (this._paused) this._resumeGame(); else this._openPauseMenu();
      });
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
    const bulletLife = BULLET_LIFE_MS * (state.bulletRange || 1);
    for (let i = 0; i < shots; i++) {
      const spread = shots > 1 ? (i - (shots - 1) / 2) * BULLET_SPREAD_ANGLE : 0;
      const a = angle + spread;
      state.bullets.push({
        x, y,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: bulletLife,
        maxLife: bulletLife,
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
    if (this._siteDownJumpscareTimer) { clearTimeout(this._siteDownJumpscareTimer); this._siteDownJumpscareTimer = null; }
    if (this._siteDown && !this._adminToken) {
      // Allow the game to start but schedule a creepy jumpscare after 30 seconds
      this._siteDownJumpscareTimer = setTimeout(() => this._playSiteDownJumpscare(), 30000);
    }
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
    this._paused = false;
    this._pausedAt = 0;
    this._totalPausedMs = 0;
    // Clear death replay data
    this._replayBuffer = [];
    this._deathReplay  = null;
    // Reset debug flags for new run
    this._debugUsed = false;
    this._debugShowEncircle = false;
    const encircleBtn = document.getElementById('adm-toggle-encircle');
    if (encircleBtn) encircleBtn.textContent = '🐍 Show Encircle Zone';
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
      enemyKills: 0,
      baseInterval: 140,
      growBuffer: 0,
      growPerApple: 2,
      shields: 0,
      lives: 3,
      ghost: 0,
      freeze: 0,
      repel: 0,
      pulse: 0,
      upgradeCount: {},
      enemySpawnTimer: 0,
      waveBreakUntil: 0,
      waveHadEnemies: false,
      waveCount: 0,
      waveSpawnCap: 10,
      waveSpawnedCount: 0,
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
    // Show pause button for solo mode
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.style.display = '';
    this._connectSpSession();
  }

  _startNightmareMode() {
    this._startGame();
    this.state.nightmareMode = true;
    document.getElementById('app').classList.add('nightmare-mode');
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.style.display = 'none';
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
    const nmKills   = this.state ? (this.state.enemyKills || 0) : 0;
    const nmElapsed = Math.max(0, (this._lastUpdateTimestamp || this.gameStartTime) - this.gameStartTime - this._totalPausedMs);
    const nmTimeSec = Math.floor(nmElapsed / 1000);
    const nmTimeFmt = `${Math.floor(nmTimeSec / 60)}:${String(nmTimeSec % 60).padStart(2, '0')}`;
    this._jumpscareTimeout = setTimeout(() => {
      this.state = null;
      this.phase = 'gameover';

      // If site is going down, show maintenance screen instead
      if (this._siteGoingDown) {
        this._hideShutdownWarning();
        this._showMaintenanceScreen(this._siteDownSince);
        return;
      }

      const el = document.getElementById('overlay');
      el.className = 'gameover';
      el.style.display = '';
      el.innerHTML = `
        <h1>☠ YOU DIED</h1>
        <div class="info">NIGHTMARE MODE</div>
        <div class="score-display">
          <span>SCORE: ${nmScore}</span>
          &nbsp;·&nbsp;
          <span>APPLES: ${nmApples}</span>
          &nbsp;·&nbsp;
          <span>KILLS: ${nmKills}</span>
          &nbsp;·&nbsp;
          <span>TIME: ${nmTimeFmt}</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="btn btn-lore" id="nm-restart-btn">NIGHTMARE AGAIN</button>
          <button class="btn btn-back" id="nm-menu-btn">← MENU</button>
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:#c33;letter-spacing:1px;">☠ NIGHTMARE LEADERBOARD</div>
          <div id="nm-leaderboard-list" class="lb-container" style="margin-top:6px;">Loading…</div>
        </div>
      `;
      document.getElementById('nm-restart-btn').addEventListener('click', () => this._startNightmareMode());
      document.getElementById('nm-menu-btn').addEventListener('click', () => {
        this.phase = 'start';
        this._renderOverlay();
      });
      this._submitNightmareScore(nmScore, nmApples, nmKills, nmTimeSec);
      this._loadNightmareLeaderboard('nm-leaderboard-list');
    }, 2500);
  }

  _playSiteDownJumpscare() {
    this._siteDownJumpscareTimer = null;
    if (this._jumpscareTimeout) { clearTimeout(this._jumpscareTimeout); this._jumpscareTimeout = null; }
    this.phase = 'site_down_jumpscare';
    this.siteDownJumpscareStart = performance.now();
    this._playScreechCreepy();
    this._jumpscareTimeout = setTimeout(() => {
      location.reload();
    }, 3500);
  }

  _playScreechCreepy() {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = this._audioCtx;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const osc3 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now  = audioCtx.currentTime;

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc3.type = 'sine';

      osc1.frequency.setValueAtTime(60,   now);
      osc1.frequency.exponentialRampToValueAtTime(4000, now + 0.1);
      osc1.frequency.exponentialRampToValueAtTime(40,   now + 0.5);
      osc1.frequency.exponentialRampToValueAtTime(3500, now + 0.8);
      osc1.frequency.exponentialRampToValueAtTime(50,   now + 1.4);
      osc1.frequency.exponentialRampToValueAtTime(4200, now + 1.7);
      osc1.frequency.exponentialRampToValueAtTime(30,   now + 2.5);

      osc2.frequency.setValueAtTime(65,   now);
      osc2.frequency.exponentialRampToValueAtTime(3900, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(45,   now + 0.55);
      osc2.frequency.exponentialRampToValueAtTime(3600, now + 0.9);
      osc2.frequency.exponentialRampToValueAtTime(55,   now + 1.5);
      osc2.frequency.exponentialRampToValueAtTime(4100, now + 1.8);
      osc2.frequency.exponentialRampToValueAtTime(35,   now + 2.5);

      osc3.frequency.setValueAtTime(20, now);
      osc3.frequency.setValueAtTime(30, now + 0.5);
      osc3.frequency.setValueAtTime(20, now + 1.0);
      osc3.frequency.setValueAtTime(40, now + 1.5);
      osc3.frequency.setValueAtTime(20, now + 2.0);

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.05);
      gain.gain.setValueAtTime(0.6, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 3.5);

      osc1.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now); osc1.stop(now + 3.5);
      osc2.start(now); osc2.stop(now + 3.5);
      osc3.start(now); osc3.stop(now + 3.5);
    } catch (_e) { /* audio unavailable */ }
  }

  _update(timestamp) {
    if (this.phase !== 'playing') return;
    if (this._paused) { this._lastFrameTime = timestamp; return; }
    const state = this.state;

    // Delta time (capped to avoid big jumps after tab switch)
    const dt = this._lastFrameTime > 0
      ? Math.min(50, timestamp - this._lastFrameTime)
      : 16;
    this._lastFrameTime = timestamp;
    this._lastUpdateTimestamp = timestamp;
    this.tick++;

    const elapsedMs = timestamp - this.gameStartTime - this._totalPausedMs;
    state.elapsedMs = elapsedMs;

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
      else { targetAngle = state.snakeAngle; }
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

    // ── Auto-aim: shoot at closest enemy with predictive leading ─
    if (this._autoAim && state.enemies && state.enemies.length) {
      const head = state.snake[0];
      let closestDist = Infinity, closestAngle = state.snakeAngle;
      for (const e of state.enemies) {
        const dx = e.x - head.x;
        const dy = e.y - head.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestDist) {
          closestDist = d2;
          const d = Math.sqrt(d2);
          if (d > 0) {
            // Predictive aiming: estimate where enemy will be when bullet arrives.
            // Enemy moves toward the snake head; bullet moves toward the enemy.
            // Both close the gap, so intercept time ≈ d / (BULLET_SPEED + enemy speed).
            const eType = ENEMY_TYPES[e.type];
            const eSpeed = (eType && eType.speed) ? eType.speed : 0.004;
            const t = d / (BULLET_SPEED + eSpeed);
            // Enemy velocity direction: toward head (normalized)
            const px = e.x + (-dx / d) * eSpeed * t;
            const py = e.y + (-dy / d) * eSpeed * t;
            closestAngle = Math.atan2(py - head.y, px - head.x);
          } else {
            closestAngle = Math.atan2(dy, dx);
          }
        }
      }
      this._shoot(head.x, head.y, closestAngle);
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
          if (this.flashTimer > 0) break; // invincibility window from a prior hit — no action
          if (state.shields > 0) {
            state.shields--;
            spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#4af', 16);
            this.flashTimer = 20;
            this._updateHUD();
            break;
          }
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
      const eatDist = state.appleEatDist || APPLE_EAT_DIST;
      const eatDist2 = eatDist * eatDist;
      // Check head first, then body segments
      let eaten = false;
      const hdx = ax - nx, hdy = ay - ny;
      if (hdx * hdx + hdy * hdy < eatDist2) {
        eaten = true;
      } else {
        for (let si = 1; si < state.snake.length; si++) {
          const seg = state.snake[si];
          const bdx = ax - seg.x, bdy = ay - seg.y;
          if (bdx * bdx + bdy * bdy < eatDist2) { eaten = true; break; }
        }
      }
      if (eaten) {
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
              state.enemyKills = (state.enemyKills || 0) + 1;
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
    // Track whether a wave has been active so we can detect a clear
    if (state.enemies.length > 0) state.waveHadEnemies = true;
    // When the last enemy is killed, start a 10–20 s downtime and increase the spawn cap
    if (state.waveHadEnemies && state.enemies.length === 0 && elapsedMs > state.waveBreakUntil) {
      state.waveBreakUntil = elapsedMs + 10000 + Math.random() * 10000;
      state.waveHadEnemies = false;
      state.waveCount = (state.waveCount || 0) + 1;
      const currentCap = state.waveSpawnCap;
      state.waveSpawnCap = Math.min(Math.floor(currentCap * 1.5), 50);
      state.waveSpawnedCount = 0; // reset per-wave spawn counter for the next wave
    }
    state.enemySpawnTimer += dt;
    const targetCount = Math.min(getTargetEnemyCount(elapsedMs, state.nightmareMode), state.waveSpawnCap);
    const spawnInterval = state.nightmareMode ? 400 : (elapsedMs >= 90000 ? 200 : (elapsedMs < 30000 ? 400 : 250));
    if (state.enemySpawnTimer >= spawnInterval && state.enemies.length < targetCount && (state.waveSpawnedCount || 0) < state.waveSpawnCap && elapsedMs >= 3000 && elapsedMs >= state.waveBreakUntil && !this._siteDown) {
      state.enemySpawnTimer = 0;
      state.waveSpawnedCount = (state.waveSpawnedCount || 0) + 1;
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
            // Charge shield absorbs any single hit
            if (e.chargeShield) {
              e.chargeShield = false;
              spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#88f', 12);
              if (!state.bulletPiercing) { bulletRemoved = true; break; }
              continue;
            }
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
                    state.enemyKills = (state.enemyKills || 0) + 1;
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
                state.enemyKills = (state.enemyKills || 0) + 1;
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
      e._prevX = e.x; // save previous position for swept collision detection
      e._prevY = e.y;
      ENEMY_TYPES[e.type].update(e, state, dt);
    }

    // ── Enemy collision ───────────────────────────
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];

      // Head collision — head instantly kills enemy (swept for low-FPS safety)
      const hitR = ENEMY_TYPES[e.type].size * 0.45 + SNAKE_RADIUS;
      const hdx = e.x - nx, hdy = e.y - ny;
      let headHit = (hdx * hdx + hdy * hdy < hitR * hitR);
      if (!headHit && e._prevX !== undefined) {
        const movX = e.x - e._prevX, movY = e.y - e._prevY;
        const movLen2 = movX * movX + movY * movY;
        if (movLen2 > 0) {
          const phX = nx - e._prevX, phY = ny - e._prevY;
          const t = Math.max(0, Math.min(1, (phX * movX + phY * movY) / movLen2));
          const cx = e._prevX + movX * t - nx;
          const cy = e._prevY + movY * t - ny;
          if (cx * cx + cy * cy < hitR * hitR) headHit = true;
        }
      }
      if (headHit) {
        // Charge shield absorbs the collision entirely — both enemy and player survive
        if (e.chargeShield) {
          e.chargeShield = false;
          spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#88f', 16);
          const pushLen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
          e.x = nx + (hdx / pushLen) * (hitR + 0.5);
          e.y = ny + (hdy / pushLen) * (hitR + 0.5);
          this.flashTimer = 20;
          continue;
        }
        if (state.shields > 0) {
          state.shields--;
          spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#4af', 16);
          state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
          state.enemies.splice(i, 1);
          state.enemyKills = (state.enemyKills || 0) + 1;
          this.flashTimer = 20;
          this._updateHUD();
          continue;
        }
        if (state.lives > 1) {
          state.lives--;
          spawnParticles(this.particles, Math.round(nx), Math.round(ny), '#f84', 16);
          state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
          state.enemies.splice(i, 1);
          state.enemyKills = (state.enemyKills || 0) + 1;
          this.flashTimer = 20;
          this._updateHUD();
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
      // Swept collision: use previous position to detect fast enemies that tunnel through the body
      const prevX = e._prevX !== undefined ? e._prevX : e.x;
      const prevY = e._prevY !== undefined ? e._prevY : e.y;
      const movX = e.x - prevX, movY = e.y - prevY;
      const movLen2 = movX * movX + movY * movY;
      for (let si = 1; si < state.snake.length; si++) {
        const s = state.snake[si];
        const bx = e.x - s.x, by = e.y - s.y;
        const d2 = bx * bx + by * by;
        if (d2 < bodyR * bodyR) {
          if (d2 < closestBodyD2) {
            bodyHit = true;
            closestBodySeg = s;
            closestBodyDx = bx; closestBodyDy = by; closestBodyD2 = d2;
          }
        } else if (movLen2 > 0) {
          // Check if the enemy swept through this segment during this frame
          const t = Math.max(0, Math.min(1, ((s.x - prevX) * movX + (s.y - prevY) * movY) / movLen2));
          const cx = prevX + movX * t - s.x;
          const cy = prevY + movY * t - s.y;
          const sd2 = cx * cx + cy * cy;
          if (sd2 < bodyR * bodyR && sd2 < closestBodyD2) {
            bodyHit = true;
            closestBodySeg = s;
            // Push direction: away from body segment at the closest approach point
            closestBodyDx = cx || (e.x - s.x); closestBodyDy = cy || (e.y - s.y);
            closestBodyD2 = sd2 || 0.0001;
          }
        }
      }

      // Push enemy out of snake body so it cannot noclip through
      if (closestBodySeg) {
        const dist = Math.sqrt(closestBodyD2) || 0.001;
        e.x = closestBodySeg.x + (closestBodyDx / dist) * (bodyR + 0.02);
        e.y = closestBodySeg.y + (closestBodyDy / dist) * (bodyR + 0.02);
      }

      if (bodyHit) {
        // Charge shield absorbs body hit
        if (e.chargeShield) {
          e.chargeShield = false;
          spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#88f', 12);
          continue;
        }
        const now2 = performance.now();
        if (!e.lastBodyHit || now2 - e.lastBodyHit >= 500) {
          e.lastBodyHit = now2;
          e.hp = (e.hp || 1) - 1; // body always deals 1 damage (minimum)
          spawnParticles(this.particles, Math.round(e.x), Math.round(e.y), '#c0f', 6);
          if (e.hp <= 0) {
            state.score += ENEMY_TYPES[e.type].score;
            state.apples.push({ x: Math.round(e.x), y: Math.round(e.y), fx: e.x, fy: e.y, dropped: true });
            state.enemies.splice(i, 1);
            state.enemyKills = (state.enemyKills || 0) + 1;
          }
        }
      }
    }

    this._updateHUD();
    this._captureReplayFrame(timestamp);

    // ── Anti-cheat: report score delta to server each frame ──
    if (this._spWs && this._spWs.readyState === WebSocket.OPEN && this._spSessionId) {
      const sc = state.score        || 0;
      const ap = state.applesEaten  || 0;
      const kl = state.enemyKills   || 0;
      const scoreDelta  = sc - this._lastTrackedScore;
      const applesDelta = ap - this._lastTrackedApples;
      const killsDelta  = kl - this._lastTrackedKills;
      if (scoreDelta > 0 || applesDelta > 0 || killsDelta > 0) {
        this._spWs.send(JSON.stringify({ type: 'sp_score_event', score: scoreDelta, apples: applesDelta, kills: killsDelta }));
        this._lastTrackedScore  = sc;
        this._lastTrackedApples = ap;
        this._lastTrackedKills  = kl;
      }
    }
  }

  _checkLoreDamage(timestamp) {
    if (this.loreEventActive) return false;
    if (this.state && this.state.nightmareMode) return false;
    if (timestamp - this.gameStartTime < 120000) return false;
    if (isNightmareUnlocked()) return false;
    this._triggerLoreEvent(timestamp);
    return true;
  }

  _captureReplayFrame(timestamp) {
    const state = this.state;
    if (!state) return;
    const REPLAY_WINDOW = 5000; // ms
    this._replayBuffer.push({
      timestamp,
      snake:     state.snake.map(s => ({ x: s.x, y: s.y })),
      snakeAngle: state.snakeAngle,
      apples:    state.apples.map(a => ({ fx: a.fx, fy: a.fy, dropped: a.dropped || false })),
      bullets:   state.bullets.map(b => ({ x: b.x, y: b.y, life: b.life, maxLife: b.maxLife })),
      enemies:   state.enemies.map(e => ({ x: e.x, y: e.y, type: e.type, id: e.id, hp: e.hp || 1, maxHp: e.maxHp || 1 })),
      chests:    (state.chests || []).map(c => ({ x: c.x, y: c.y, rarity: c.rarity })),
      particles: this.particles.map(p => ({ ...p })),
      tick:      this.tick,
    });
    // Trim frames older than 5 seconds
    while (this._replayBuffer.length > 0 && timestamp - this._replayBuffer[0].timestamp > REPLAY_WINDOW) {
      this._replayBuffer.shift();
    }
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

      gain.gain.setValueAtTime(0.25, now);
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
    // Capture sessionId before disconnect so score submission can reference it
    this._submittedSessionId = this._spSessionId;
    // Capture elapsed time and kill count before disconnect
    this._deathElapsedMs = Math.max(0, (this._lastUpdateTimestamp || this.gameStartTime) - this.gameStartTime - this._totalPausedMs);
    this._deathKills = state.enemyKills || 0;
    this._disconnectSpSession();
    if (state.nightmareMode) {
      this._playNightmareJumpscare();
      return;
    }
    // Capture one final frame (with death particles) and save for replay button
    this._captureReplayFrame(performance.now());
    if (this._replayBuffer.length > 0) {
      this._deathReplay  = this._replayBuffer.slice();
      this._replayBuffer = [];
    }
    this.phase = 'gameover';
    this._showOverlay('gameover', reason);
  }

  _chooseUpgrade(upgrade) {
    if (this.phase !== 'upgrade') return; // guard: stale handlers can't fire twice
    const state = this.state;
    upgrade.apply(state);
    state.upgradeCount[upgrade.id] = (state.upgradeCount[upgrade.id] || 0) + 1;
    // Scale apples needed for next upgrade
    const totalPerks = Object.values(state.upgradeCount).reduce((a, b) => a + b, 0);
    if (totalPerks <= 10) {
      state.applesForNextUpgrade = 1 + Math.floor(totalPerks / 4);
    } else {
      // After 10 perks: steeper cost, but slightly reduced from before
      const base = 1 + Math.floor(10 / 4); // = 3 at 10 perks
      const extra = totalPerks - 10;
      state.applesForNextUpgrade = base + extra * 2 + Math.floor(extra * extra / 6);
    }
    this._hideUpgradePanel();
    this.phase = 'playing';
    this._updateHUD();
  }

  _updateHUD() {
    if (!this.state) return;
    const s = this.state;

    // Hide the stats row (APPLES / TIME / upgrades) during solo gameplay
    const hudStats = document.getElementById('hud-stats');
    if (hudStats) hudStats.style.display = 'none';

    // Perk progress bar
    const perkBar = document.getElementById('hud-perk-bar');
    if (!s.nightmareMode && s.applesForNextUpgrade >= 1) {
      const progress = s.applesEatenSinceUpgrade / s.applesForNextUpgrade;
      const pct = Math.min(100, Math.round(progress * 100));
      // Build the bar DOM once; afterwards just update the fill width
      if (!perkBar.querySelector('#hud-perk-bar-track')) {
        perkBar.innerHTML = '<span class="label">PERK</span><span id="hud-perk-bar-track"><span id="hud-perk-bar-fill"></span></span>';
      }
      perkBar.style.display = 'flex';
      const fill = document.getElementById('hud-perk-bar-fill');
      if (fill) fill.style.width = pct + '%';
    } else {
      perkBar.style.display = 'none';
      perkBar.innerHTML = '';
    }

    // Lives / hearts row (below perk bar)
    const livesRow = document.getElementById('hud-lives');
    if (livesRow && !s.nightmareMode) {
      const maxLives = 3;
      const currentLives = s.lives !== undefined ? s.lives : 3;
      const wardActive = (s.shields || 0) > 0;
      let html = '';
      for (let i = 0; i < maxLives; i++) {
        const filled = i < currentLives;
        let src;
        if (filled && wardActive && i === currentLives - 1) {
          src = 'sprites/WARD.png';
        } else if (filled) {
          src = 'sprites/HEART.png';
        } else {
          src = 'sprites/HEARTEMPTY.png';
        }
        html += `<img src="${src}" style="width:36px;height:36px;vertical-align:middle;image-rendering:pixelated;">`;
      }
      livesRow.innerHTML = html;
      livesRow.style.display = 'flex';
    } else if (livesRow) {
      livesRow.style.display = 'none';
      livesRow.innerHTML = '';
    }

    // Build upgrade summary
    const parts = [];
    if (s.nightmareMode) {
      parts.push('☠ NIGHTMARE');
    } else {
      if (s.ghost) parts.push('👻');
      if (s.freeze) parts.push(`❄️×${s.freeze}`);
      if (s.pulse) parts.push(`💫×${s.pulse}`);
      if (s.oracle) parts.push('🔮');
      if (s.upgradeCount && s.upgradeCount['behemoth']) parts.push('🐉');
      if (s.upgradeCount && s.upgradeCount['rapid_fire']) parts.push(`🔫×${s.upgradeCount['rapid_fire']}`);
      if (s.bulletPiercing) parts.push('🏹');
      if (s.bulletExplosive) parts.push('💣');
      if (s.multishot) parts.push(`✳️×${s.multishot}`);
      if (s.bulletDamage && s.bulletDamage > 2) parts.push(`🔥×${s.bulletDamage - 2}`);
      if (s.upgradeCount && s.upgradeCount['bullet_range']) parts.push(`🎯×${s.upgradeCount['bullet_range']}`);
    }
    document.getElementById('hud-upgrades').innerHTML = parts.join('  ');
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
      const frame = Math.floor(elapsed / 200) % 2;
      ctx.fillStyle = frame === 0 ? '#660000' : '#1a0000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = frame === 0 ? '#ff6666' : '#cc0000';
      ctx.font = `bold ${Math.floor(80 + Math.sin(elapsed * 0.05) * 10)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', W / 2, H / 2 - 50);
      ctx.font = 'bold 36px Courier New';
      ctx.fillText('YOU DIED', W / 2, H / 2 + 40);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // ── Site-down jumpscare phase ──────────────
    if (this.phase === 'site_down_jumpscare') {
      const elapsed = timestamp - this.siteDownJumpscareStart;
      // Fast alternating flicker between pure black and deep red
      const frame = Math.floor(elapsed / 100) % 2;
      ctx.fillStyle = frame === 0 ? '#000000' : '#110000';
      ctx.fillRect(0, 0, W, H);

      // Random static noise overlay
      const noiseAlpha = 0.08 + 0.12 * Math.random();
      ctx.fillStyle = `rgba(255,0,0,${noiseAlpha})`;
      for (let i = 0; i < 60; i++) {
        const nx = Math.random() * W;
        const ny = Math.random() * H;
        const nw = 2 + Math.random() * 6;
        const nh = 1 + Math.random() * 3;
        ctx.fillRect(nx, ny, nw, nh);
      }

      // Pulsing red glow
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.015);
      ctx.fillStyle = `rgba(180,0,0,${0.08 + pulse * 0.12})`;
      ctx.fillRect(0, 0, W, H);

      // Main text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textFlicker = Math.floor(elapsed / 80) % 3;
      ctx.fillStyle = textFlicker === 0 ? '#ff0000' : textFlicker === 1 ? '#ff4444' : '#cc0000';
      ctx.font = `bold ${Math.floor(52 + Math.sin(elapsed * 0.02) * 6)}px Courier New`;
      ctx.fillText('YOU SHOULD NOT BE HERE', W / 2, H / 2 - 44);

      // Distorted subtitle
      const subFlicker = Math.floor(elapsed / 120) % 2;
      ctx.fillStyle = subFlicker === 0 ? '#880000' : '#ff2222';
      ctx.font = 'bold 22px Courier New';
      ctx.fillText('SITE IS DOWN', W / 2, H / 2 + 10);
      ctx.font = 'bold 16px Courier New';
      ctx.fillStyle = frame === 0 ? '#550000' : '#ff0000';
      ctx.fillText('╔═══[ ERROR ]═══╗', W / 2, H / 2 + 42);
      ctx.fillText('RELOADING...', W / 2, H / 2 + 66);

      ctx.textBaseline = 'alphabetic';
      return;
    }

    // ── Death replay phase ─────────────────────
    if (this.phase === 'death_replay') {
      this._renderDeathReplay(ctx, timestamp);
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
      if (Math.floor(elapsed / 200) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }

    // ── Main menu / gameover background grid ──────
    if (!state) {
      // Draw a subtle grid so GUI scale changes are visually apparent
      drawGrid(ctx, VIEW_COLS / 2, VIEW_ROWS / 2);
      return;
    }

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
    if (this._debugShowEncircle) this._drawEncircleOverlay(ctx, state);
    drawEnemies(ctx, state, this.tick);

    // Pulse rings
    if (_fxEnabled && state.pulseEffects) {
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
    } else if (state.pulseEffects) {
      // Still advance pulse state even when effects disabled, so stale entries don't pile up
      for (const pe of state.pulseEffects) { pe.r += (pe.maxR - pe.r) * 0.25 + 0.2; pe.life -= 0.06; }
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

    // ── Off-screen enemy indicators ─────────────────────────────
    if (state && state.enemies.length > 0 && this.phase === 'playing') {
      this._drawEnemyIndicators(ctx, state, timestamp);
    }

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
        ctx.shadowBlur = _fxEnabled ? 16 : 0;
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

  _drawEnemyIndicators(ctx, state, timestamp) {
    const margin = 20;
    const camX = state.snake[0].x;
    const camY = state.snake[0].y;
    // Flash at ~2 Hz
    const flash = Math.floor(timestamp / 400) % 2 === 0;
    if (!flash) return;

    ctx.save();
    for (const e of state.enemies) {
      // Compute screen-space position of enemy
      const sx = (e.x - camX) * GRID + W / 2;
      const sy = (e.y - camY) * GRID + H / 2;

      // Only draw indicator if enemy is off-screen
      if (sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin) continue;

      // Angle from screen center to enemy screen pos
      const angle = Math.atan2(sy - H / 2, sx - W / 2);
      const cos = Math.cos(angle), sin = Math.sin(angle);

      // Find intersection with screen rectangle (inset by margin)
      const hw = W / 2 - margin, hh = H / 2 - margin;
      let ex, ey;
      if (Math.abs(cos) * hh > Math.abs(sin) * hw) {
        ex = Math.sign(cos) * hw;
        ey = ex * Math.tan(angle);
      } else {
        ey = Math.sign(sin) * hh;
        ex = ey / Math.tan(angle);
      }
      ex += W / 2;
      ey += H / 2;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(255,50,50,0.9)';
      ctx.shadowBlur = _fxEnabled ? 10 : 0;
      ctx.shadowColor = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _gameLoop(timestamp) {
    // FPS cap: skip render if running faster than the target
    if (this._fpsCap > 0) {
      const minInterval = 1000 / this._fpsCap;
      if (timestamp - (this._lastRenderTimestamp || 0) < minInterval - 1) {
        requestAnimationFrame(this._loop);
        return;
      }
    }
    this._lastRenderTimestamp = timestamp;
    this._update(timestamp);
    this._sendMouseDirection();
    this._renderFrame(timestamp);
    if (this._adminPanelOpen && timestamp - this._lastDebugUpdate > 200) {
      this._lastDebugUpdate = timestamp;
      this._updateDebugCounters();
    }
    requestAnimationFrame(this._loop);
  }

  _startDeathReplay() {
    if (!this._deathReplay || this._deathReplay.length === 0) return;
    this._deathReplayStart = performance.now();
    this.phase = 'death_replay';
    document.getElementById('overlay').style.display = 'none';
  }

  _renderDeathReplay(ctx, timestamp) {
    const frames = this._deathReplay;
    if (!frames || frames.length === 0) {
      this.phase = 'gameover';
      document.getElementById('overlay').style.display = '';
      return;
    }

    const elapsed   = timestamp - this._deathReplayStart;
    const firstTs   = frames[0].timestamp;
    const lastTs    = frames[frames.length - 1].timestamp;
    const targetTs  = firstTs + elapsed;

    // Find the nearest frame to display
    let frame = frames[frames.length - 1];
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].timestamp >= targetTs) {
        frame = frames[i];
        break;
      }
    }

    // Once we've played through all frames, transition back to gameover overlay
    if (elapsed > lastTs - firstTs + 400) {
      this.phase = 'gameover';
      document.getElementById('overlay').style.display = '';
      return;
    }

    // Background
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, W, H);

    const camX    = frame.snake[0].x;
    const camY    = frame.snake[0].y;
    const camOffX = W / 2 - camX * GRID;
    const camOffY = H / 2 - camY * GRID;
    ctx.save();
    ctx.translate(camOffX, camOffY);

    drawGrid(ctx, camX, camY);

    // Build a pseudo-state object compatible with the draw functions
    const ps = {
      snake:      frame.snake,
      snakeAngle: frame.snakeAngle,
      apples:     frame.apples.map(a => ({ x: Math.round(a.fx), y: Math.round(a.fy), fx: a.fx, fy: a.fy, dropped: a.dropped })),
      bullets:    frame.bullets,
      enemies:    frame.enemies,
      chests:     frame.chests,
    };

    drawApples(ctx, ps, frame.tick);
    drawChests(ctx, ps, frame.tick);
    drawBullets(ctx, ps.bullets);
    drawSnake(ctx, ps);
    drawEnemies(ctx, ps, frame.tick);
    drawParticles(ctx, frame.particles);

    ctx.restore();

    // "DEATH REPLAY" watermark
    const alpha = 0.4 + 0.3 * Math.sin(timestamp * 0.006);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#ff4444';
    ctx.font        = 'bold 13px Courier New';
    ctx.textAlign   = 'right';
    ctx.fillText('⏮ DEATH REPLAY', W - 14, 22);
    ctx.restore();
  }

  // ── UI methods ──────────────────────────────
  _hideOverlay() {
    document.getElementById('overlay').style.display = 'none';
    // Keep admin open button visible during gameplay when admin mode is active
    const adminOpenBtn = document.getElementById('admin-open-btn');
    if (adminOpenBtn) adminOpenBtn.style.display = this._adminToken ? '' : 'none';
    // Hide feedback button during gameplay
    const feedbackBtn = document.getElementById('feedback-open-btn');
    if (feedbackBtn) feedbackBtn.style.display = 'none';
  }

  _showOverlay(type, reason) {
    const el = document.getElementById('overlay');
    el.className = type;
    el.style.display = '';
    // Hide pause button when game ends
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.style.display = 'none';
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.style.display = 'none';

    if (type === 'gameover') {
      // If site is going down, show maintenance screen immediately after this round ends
      if (this._siteGoingDown) {
        this._hideShutdownWarning();
        el.style.display = 'none';
        this._showMaintenanceScreen(this._siteDownSince);
        return;
      }

      const s = this.state;
      const reasonText = reason === 'wall' ? 'hit a wall' : reason === 'self' ? 'bit your own tail' : 'caught by an enemy';
      const deathTimeSec = Math.floor((this._deathElapsedMs || 0) / 1000);
      const deathTimeFmt = `${Math.floor(deathTimeSec / 60)}:${String(deathTimeSec % 60).padStart(2, '0')}`;
      const deathKills   = this._deathKills || 0;

      // Build upgrade list (exclude WARD — it's shown as a health stat, not a perk)
      const upgradeNames = Object.entries(s.upgradeCount)
        .map(([id, count]) => {
          if (id === WARD_PERK_ID) return '';
          const u = UPGRADES.find(u => u.id === id);
          if (!u) return '';
          const countSuffix = (!u.oneTime && count > 1) ? ` ×${count}` : '';
          return `<span>${u.icon} ${u.name}${countSuffix}</span>`;
        })
        .filter(Boolean).join('  ');

      el.innerHTML = `
        <h1>YOU DIED</h1>
        <div class="score-display">
          <span>SCORE: ${s.score}</span>
          &nbsp;·&nbsp;
          <span>APPLES: ${s.applesEaten}</span>
          &nbsp;·&nbsp;
          <span>KILLS: ${deathKills}</span>
          &nbsp;·&nbsp;
          <span>TIME: ${deathTimeFmt}</span>
        </div>
        <div class="info">You ${reasonText}.</div>
        ${upgradeNames ? `<div id="upgrades-list">${upgradeNames}</div>` : ''}
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="btn" id="restart-btn">PLAY AGAIN [Enter]</button>
          ${this._deathReplay ? '<button class="btn btn-lore" id="replay-btn">⏮ WATCH REPLAY</button>' : ''}
          <button class="btn btn-back" id="menu-btn">← MENU</button>
        </div>
        <div class="controls">Mouse to steer · Mobile: joystick · LMB to shoot</div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:#555;letter-spacing:1px;">🏆 LEADERBOARD</div>
          <div id="leaderboard-list" class="lb-container" style="margin-top:6px;">Loading…</div>
        </div>
      `;
      document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
      const replayBtn = document.getElementById('replay-btn');
      if (replayBtn) replayBtn.addEventListener('click', () => this._startDeathReplay());
      document.getElementById('menu-btn').addEventListener('click', () => {
        this.state = null;
        this._replayBuffer = [];
        this._deathReplay  = null;
        this.phase = 'start';
        this._renderOverlay();
      });
      // Submit score and load leaderboard
      this._submitScore(s.score, s.applesEaten, deathKills, deathTimeSec);
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
    const hudStats = document.getElementById('hud-stats');
    if (hudStats) hudStats.style.display = '';
    const perkBar = document.getElementById('hud-perk-bar');
    if (perkBar) { perkBar.style.display = 'none'; perkBar.innerHTML = ''; }
    const livesRow = document.getElementById('hud-lives');
    if (livesRow) { livesRow.style.display = 'none'; livesRow.innerHTML = ''; }
    // Hide pause button on main menu
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.style.display = 'none';
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.style.display = 'none';
    this._paused = false;

    const el = document.getElementById('overlay');
    el.style.display = '';
    el.className = 'start';
    const nightmareUnlocked = isNightmareUnlocked();
    const accountSection = this._accountUsername
      ? `<div class="account-section">
           <div class="account-logged-in">
             👤 ${escapeHtml(this._accountUsername)}
             <button class="btn btn-back" id="account-logout-btn" style="font-size:10px;padding:2px 10px;margin-top:0;">Logout</button>
           </div>
         </div>`
      : `<div class="account-section">
           <button class="btn btn-online" id="account-login-btn" style="font-size:12px;padding:6px 20px;margin-top:0;">👤 Login / Create Account</button>
           <div style="font-size:10px;color:#456;margin-top:2px;">No account? You'll play as Anonymous</div>
         </div>`;
    el.innerHTML = `
      <h1>VIPER.exe<sup style="font-size:0.45em;letter-spacing:1px;vertical-align:super;">™</sup></h1>
      <div class="info">
        A roguelike snake<br>
        Eat apples → choose upgrades → survive<br>
        Enemies grow stronger over time
      </div>
      ${accountSection}
      <div class="controls">
        ${this._controlMode === 'wasd' ? 'WASD/Arrows to steer · Mouse to aim · LMB to shoot' : 'Mouse to steer · LMB to shoot'}<br>
        Mobile: joystick to move · gun joystick to shoot
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" id="start-btn">SOLO [Enter]</button>
        <button class="btn btn-online" id="online-btn">⚡ ONLINE</button>
        <button class="btn btn-settings" id="settings-btn">⚙ SETTINGS</button>
        <button class="btn btn-settings" id="customize-btn">🎨 CUSTOMIZE</button>
      </div>
      ${nightmareUnlocked ? '<button class="btn btn-lore" id="lore-red-btn">☠ NIGHTMARE</button>' : ''}
      <div id="leaderboard-section" style="margin-top:16px;">
        <div style="font-size:11px;color:#555;letter-spacing:1px;">🏆 LEADERBOARD</div>
        <div id="leaderboard-list" class="lb-container" style="margin-top:6px;">Loading…</div>
      </div>
      ${nightmareUnlocked ? `
      <div id="nm-leaderboard-section" style="margin-top:12px;">
        <div style="font-size:11px;color:#933;letter-spacing:1px;">☠ NIGHTMARE LEADERBOARD</div>
        <div id="nm-leaderboard-list" class="lb-container" style="margin-top:6px;">Loading…</div>
      </div>` : ''}
    `;
    const loginBtn = document.getElementById('account-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => this._openAuthModal('login'));
    const logoutBtn = document.getElementById('account-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this._logoutAccount());
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
    document.getElementById('online-btn').addEventListener('click', () => this._startOnlineMode());
    document.getElementById('settings-btn').addEventListener('click', () => this._openSettings());
    document.getElementById('customize-btn').addEventListener('click', () => this._openCustomizeMenu());
    const loreBtn = document.getElementById('lore-red-btn');
    if (loreBtn) loreBtn.addEventListener('click', () => this._startNightmareMode());
    this._loadLeaderboard('leaderboard-list');
    if (nightmareUnlocked) this._loadNightmareLeaderboard('nm-leaderboard-list');
    // Show admin open button on main menu (bottom-right, outside the overlay)
    this._showAdminOpenBtn();
    // Show feedback button on main menu (top-right)
    this._showFeedbackBtn();
    // Check if the player's leaderboard rank was removed
    this._checkRemovalNotice();
  }

  _toggleControlMode() {
    this._controlMode = this._controlMode === 'wasd' ? 'mouse' : 'wasd';
    try { localStorage.setItem('controlMode', this._controlMode); } catch(_) {}
  }

  _openPauseMenu() {
    if (this.phase !== 'playing' || this.online) return;
    this._paused = true;
    this._pausedAt = performance.now();
    const pauseMenu = document.getElementById('pause-menu');
    if (!pauseMenu) return;
    const s = this.state;
    const elapsedMs = Math.max(0, (this._lastUpdateTimestamp || this.gameStartTime) - this.gameStartTime - this._totalPausedMs);
    const secs = Math.floor(elapsedMs / 1000);
    const timeFmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const kills = s ? (s.enemyKills || 0) : 0;
    // Build perks list for pause menu (exclude WARD — it's a health stat)
    const pausePerks = s ? Object.entries(s.upgradeCount)
      .map(([id, count]) => {
        if (id === WARD_PERK_ID) return '';
        const u = UPGRADES.find(u => u.id === id);
        if (!u) return '';
        const countSuffix = (!u.oneTime && count > 1) ? ` ×${count}` : '';
        return `<span>${u.icon} ${u.name}${countSuffix}</span>`;
      })
      .filter(Boolean).join('  ') : '';
    pauseMenu.innerHTML = `
      <div style="font-size:22px;color:#7ef;letter-spacing:4px;text-transform:uppercase;text-shadow:0 0 12px #4af;">⏸ PAUSED</div>
      <div style="font-size:11px;color:#7ab;letter-spacing:1px;margin-bottom:4px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <span>SCORE: ${s ? s.score : 0}</span>
        <span>APPLES: ${s ? s.applesEaten : 0}</span>
        <span>KILLS: ${kills}</span>
        <span>TIME: ${timeFmt}</span>
      </div>
      ${pausePerks ? `<div id="upgrades-list" style="font-size:12px;margin-bottom:4px;">${pausePerks}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;align-items:center;">
        <button class="btn" id="pm-resume-btn">▶ RESUME [ESC]</button>
        <button class="btn btn-settings" id="pm-settings-btn">⚙ SETTINGS</button>
        <button class="btn btn-back" id="pm-menu-btn">← MAIN MENU</button>
      </div>
    `;
    pauseMenu.style.display = 'flex';
    document.getElementById('pm-resume-btn').addEventListener('click', () => this._resumeGame());
    document.getElementById('pm-settings-btn').addEventListener('click', () => {
      pauseMenu.style.display = 'none';
      this._openSettings(() => {
        pauseMenu.style.display = 'flex';
      });
    });
    document.getElementById('pm-menu-btn').addEventListener('click', () => {
      this._resumeGame();
      this.state = null;
      this.phase = 'start';
      this._renderOverlay();
    });
  }

  _resumeGame() {
    if (!this._paused) return;
    const pausedDuration = performance.now() - this._pausedAt;
    this._totalPausedMs += pausedDuration;
    this._paused = false;
    this._pausedAt = 0;
    this._lastFrameTime = 0; // reset so dt doesn't spike
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.style.display = 'none';
  }

  _openSettings(onClose) {
    // Remove any existing settings overlay
    const existing = document.getElementById('settings-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(5,5,15,0.92)',
      'display:flex', 'align-items:center', 'justify-content:center', 'z-index:200',
      'overflow-y:auto', 'padding:32px',
    ].join(';');

    const ctrlLabel = this._controlMode === 'wasd' ? '⌨ WASD' : '🖱 MOUSE';
    const scaleVal = (this._guiScale || 1.0).toFixed(2);
    const fpsCap = this._fpsCap || 0;
    const fpsLabel = fpsCap === 0 ? '∞ UNLIMITED' : `${fpsCap} FPS`;
    const particleOptions = [
      { label: '✦ FULL', value: 'full' },
      { label: '◈ REDUCED', value: 'reduced' },
      { label: '○ OFF', value: 'off' },
    ];
    const particleButtons = particleOptions.map(o => {
      const active = (this._particleQuality || 'full') === o.value;
      return `<button class="gfx-opt-btn${active ? ' active' : ''}" data-particle="${o.value}" style="flex:1;padding:5px 2px;font-size:10px;font-family:'Courier New',monospace;letter-spacing:1px;background:${active ? '#1a1a3a' : '#0a0a18'};border:1px solid ${active ? '#89b' : '#334'};color:${active ? '#cde' : '#567'};cursor:pointer;border-radius:3px;transition:all 0.1s;">${o.label}</button>`;
    }).join('');
    const fxEnabled = this._fxEnabled !== false;
    const fxLabel = fxEnabled ? '✦ ON' : '○ OFF';
    const fxBtnStyle = (active) => `flex:1;padding:5px 2px;font-size:10px;font-family:'Courier New',monospace;letter-spacing:1px;background:${active ? '#1a1a3a' : '#0a0a18'};border:1px solid ${active ? '#89b' : '#334'};color:${active ? '#cde' : '#567'};cursor:pointer;border-radius:3px;transition:all 0.1s;`;
    const autoAimEnabled = this._autoAim === true;

    overlay.innerHTML = `
      <div style="background:#0e0e1a;border:1px solid #446;border-radius:10px;
                  min-width:300px;max-width:360px;max-height:90vh;
                  position:relative;display:flex;flex-direction:column;">
        <img id="settings-bat-img" src="sprites/BAT.png"
             style="position:absolute;top:-22px;right:-22px;width:44px;height:44px;z-index:10;
                    filter:drop-shadow(0 0 8px rgba(153,51,255,0.9));transform:rotate(25deg);pointer-events:none;"
             alt="bat">
        <div style="padding:28px 32px 0 32px;display:flex;flex-direction:column;align-items:center;gap:0;flex-shrink:0;">
          <div style="font-size:16px;color:#89b;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">⚙ SETTINGS</div>
        </div>
        <div class="settings-box" style="overflow-y:auto;padding:0 32px 28px 32px;
                    display:flex;flex-direction:column;align-items:center;gap:18px;">
          <div style="width:100%;display:flex;flex-direction:column;gap:14px;">

            <!-- Gameplay separator -->
            <div style="border-top:1px solid #223;margin:2px 0;"></div>
            <div style="font-size:11px;color:#567;letter-spacing:2px;text-transform:uppercase;">🎮 GAMEPLAY</div>

            <!-- Control mode -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <span style="font-size:12px;color:#7ab;letter-spacing:1px;">CONTROL MODE</span>
              <button id="settings-ctrl-btn" class="btn btn-settings" style="margin-top:0;font-size:12px;padding:6px 18px;">${ctrlLabel}</button>
            </div>

            <!-- Auto-Aim -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <span style="font-size:12px;color:#7ab;letter-spacing:1px;">AUTO AIM</span>
              <div id="autoaim-btns" style="display:flex;gap:6px;">
                <button data-autoaim="true"  style="${fxBtnStyle(autoAimEnabled)}">✦ ON</button>
                <button data-autoaim="false" style="${fxBtnStyle(!autoAimEnabled)}">○ OFF</button>
              </div>
            </div>

            <!-- GUI Scale -->
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;color:#7ab;letter-spacing:1px;">GUI SCALE</span>
                <span id="settings-scale-val" style="font-size:12px;color:#aef;letter-spacing:1px;">${scaleVal}×</span>
              </div>
              <input id="settings-scale-slider" type="range" min="0.5" max="2.0" step="0.05"
                     value="${scaleVal}"
                     class="custom-slider" style="width:100%;cursor:pointer;">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:#456;">
                <span>0.5× (zoom out)</span><span>2.0× (zoom in)</span>
              </div>
              <div style="padding:8px;background:#050510;border:1px solid #335;border-radius:6px;overflow:hidden;height:52px;display:flex;align-items:center;justify-content:center;">
                <div id="settings-scale-preview" style="display:flex;gap:8px;align-items:center;transform:scale(${scaleVal});transform-origin:center center;transition:transform 0.1s;white-space:nowrap;">
                  <span style="font-size:14px;color:#4f8;letter-spacing:2px;text-shadow:0 0 8px #2d6;">VIPER.exe</span>
                  <span style="font-size:10px;color:#7ab;background:#0e0e1a;border:1px solid #234;border-radius:3px;padding:2px 6px;">START</span>
                  <span style="font-size:12px;">🦇</span>
                </div>
              </div>
            </div>

            <!-- Graphics separator -->
            <div style="border-top:1px solid #223;margin:2px 0;"></div>
            <div style="font-size:11px;color:#567;letter-spacing:2px;text-transform:uppercase;">🖥 GRAPHICS</div>

            <!-- FPS Cap Slider -->
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;color:#7ab;letter-spacing:1px;">FRAME RATE CAP</span>
                <span id="settings-fps-val" style="font-size:12px;color:#aef;letter-spacing:1px;">${fpsLabel}</span>
              </div>
              <input id="settings-fps-slider" type="range" min="30" max="241" step="1"
                     value="${fpsCap === 0 ? 241 : fpsCap}"
                     class="custom-slider" style="width:100%;cursor:pointer;">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:#456;">
                <span>30 FPS</span><span>UNLIMITED</span>
              </div>
            </div>

            <!-- Special Effects -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <span style="font-size:12px;color:#7ab;letter-spacing:1px;">SPECIAL EFFECTS</span>
              <div id="fx-btns" style="display:flex;gap:6px;">
                <button data-fx="true"  style="${fxBtnStyle(fxEnabled)}">✦ ON</button>
                <button data-fx="false" style="${fxBtnStyle(!fxEnabled)}">○ OFF</button>
              </div>
            </div>

            <!-- Particle Quality -->
            <div style="display:flex;flex-direction:column;gap:5px;">
              <span style="font-size:12px;color:#7ab;letter-spacing:1px;">PARTICLE EFFECTS</span>
              <div id="particle-btns" style="display:flex;gap:6px;">${particleButtons}</div>
            </div>

          </div>
          <button id="settings-close-btn" class="btn btn-back" style="margin-top:4px;font-size:12px;padding:6px 24px;">✕ CLOSE</button>
          <div style="border-top:1px solid #223;width:100%;"></div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button id="settings-tos-btn" class="btn btn-back" style="margin-top:0;font-size:10px;padding:4px 12px;">📄 TERMS OF SERVICE</button>
            <button id="settings-pp-btn" class="btn btn-back" style="margin-top:0;font-size:10px;padding:4px 12px;">🔒 PRIVACY POLICY</button>
          </div>
          <div style="font-size:9px;color:#334;letter-spacing:1px;text-align:center;">© 2026 VIPER.exe — All rights reserved.</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('settings-ctrl-btn').addEventListener('click', () => {
      this._toggleControlMode();
      const btn = document.getElementById('settings-ctrl-btn');
      if (btn) btn.textContent = this._controlMode === 'wasd' ? '⌨ WASD' : '🖱 MOUSE';
    });

    const slider = document.getElementById('settings-scale-slider');
    const scaleDisplay = document.getElementById('settings-scale-val');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this._guiScale = v;
      scaleDisplay.textContent = v.toFixed(2) + '×';
      const preview = document.getElementById('settings-scale-preview');
      if (preview) preview.style.transform = `scale(${v.toFixed(2)})`;
      try { localStorage.setItem('guiScale', v.toFixed(2)); } catch(_) {}
      this._resizeCanvas(false);
      this._applyGuiScaleToUI();
    });

    // FPS cap slider
    const fpsSlider = document.getElementById('settings-fps-slider');
    const fpsDisplay = document.getElementById('settings-fps-val');
    fpsSlider.addEventListener('input', () => {
      const raw = parseInt(fpsSlider.value, 10);
      const val = raw === 241 ? 0 : raw;
      this._fpsCap = val;
      fpsDisplay.textContent = val === 0 ? '∞ UNLIMITED' : `${val} FPS`;
      try { localStorage.setItem('fpsCap', val); } catch(_) {}
    });

    // Special effects toggle
    document.getElementById('fx-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-fx]');
      if (!btn) return;
      const val = btn.dataset.fx === 'true';
      this._fxEnabled = val;
      this._applyFxSettings();
      try { localStorage.setItem('fxEnabled', val); } catch(_) {}
      document.querySelectorAll('#fx-btns [data-fx]').forEach(b => {
        const active = (b.dataset.fx === 'true') === val;
        b.style.background = active ? '#1a1a3a' : '#0a0a18';
        b.style.borderColor = active ? '#89b' : '#334';
        b.style.color = active ? '#cde' : '#567';
      });
    });

    // Particle quality buttons
    document.getElementById('particle-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-particle]');
      if (!btn) return;
      const val = btn.dataset.particle;
      this._particleQuality = val;
      this._applyFxSettings();
      try { localStorage.setItem('particleQuality', val); } catch(_) {}
      document.querySelectorAll('#particle-btns [data-particle]').forEach(b => {
        const active = b.dataset.particle === val;
        b.style.background = active ? '#1a1a3a' : '#0a0a18';
        b.style.borderColor = active ? '#89b' : '#334';
        b.style.color = active ? '#cde' : '#567';
      });
    });

    // Auto-aim toggle
    document.getElementById('autoaim-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-autoaim]');
      if (!btn) return;
      const val = btn.dataset.autoaim === 'true';
      this._autoAim = val;
      try { localStorage.setItem('autoAim', val); } catch(_) {}
      document.querySelectorAll('#autoaim-btns [data-autoaim]').forEach(b => {
        const active = (b.dataset.autoaim === 'true') === val;
        b.style.background = active ? '#1a1a3a' : '#0a0a18';
        b.style.borderColor = active ? '#89b' : '#334';
        b.style.color = active ? '#cde' : '#567';
      });
    });

    document.getElementById('settings-close-btn').addEventListener('click', () => {
      overlay.remove();
      if (onClose) onClose(); else this._renderOverlay();
    });

    document.getElementById('settings-tos-btn').addEventListener('click', () => this._openLegalModal('tos'));
    document.getElementById('settings-pp-btn').addEventListener('click', () => this._openLegalModal('pp'));

    // Close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.remove();
        if (onClose) onClose(); else this._renderOverlay();
      }
    });
  }

  _openCustomizeMenu() {
    const existing = document.getElementById('customize-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customize-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(5,5,15,0.92)',
      'display:flex', 'align-items:center', 'justify-content:center', 'z-index:200',
    ].join(';');

    overlay.innerHTML = `
      <div style="background:#0e0e1a;border:1px solid #2a6;border-radius:10px;
                  min-width:360px;max-width:520px;padding:28px 28px 24px;
                  display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div style="font-size:16px;color:#4f8;letter-spacing:4px;text-transform:uppercase;text-shadow:0 0 12px #2d6;">
          🎨 CUSTOMIZE
        </div>

        <!-- Preview + vertical brightness slider -->
        <div style="display:flex;align-items:center;gap:14px;">
          <!-- Preview canvas (large, takes up most of the space) -->
          <canvas id="cust-preview" width="300" height="200"
                  style="border:1px solid #234;border-radius:6px;background:#080812;
                         image-rendering:pixelated;flex:1;"></canvas>
          <!-- Vertical brightness slider pushed to the right side -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <span style="font-size:10px;color:#aef;letter-spacing:1px;">☀</span>
            <input id="cust-brightness-slider" type="range" orient="vertical"
                   min="20" max="80" step="1" value="${_snakeBrightness}"
                   class="custom-slider"
                   style="-webkit-appearance:slider-vertical;appearance:slider-vertical;
                          writing-mode:vertical-lr;direction:rtl;
                          height:170px;width:20px;cursor:pointer;padding:0;">
            <span style="font-size:10px;color:#456;letter-spacing:1px;">◐</span>
          </div>
        </div>

        <!-- Horizontal hue slider -->
        <div style="width:100%;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;color:#7ab;letter-spacing:1px;">HUE</span>
            <span id="cust-hue-val" style="font-size:12px;color:#aef;letter-spacing:1px;">${_snakeHue}°</span>
          </div>
          <input id="cust-hue-slider" type="range" min="0" max="359" step="1"
                 value="${_snakeHue}" class="custom-slider"
                 style="width:100%;cursor:pointer;
                        background:linear-gradient(to right,
                          hsl(0,80%,55%), hsl(40,80%,55%), hsl(80,80%,55%),
                          hsl(120,80%,55%), hsl(160,80%,55%), hsl(200,80%,55%),
                          hsl(240,80%,55%), hsl(280,80%,55%), hsl(320,80%,55%),
                          hsl(359,80%,55%));
                        border-radius:3px;">
        </div>

        <button id="cust-close-btn" class="btn" style="margin-top:0;font-size:12px;padding:8px 28px;">
          ✓ SAVE & CLOSE
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const previewCanvas = document.getElementById('cust-preview');
    const hueSlider = document.getElementById('cust-hue-slider');
    const hueVal = document.getElementById('cust-hue-val');
    const brightnessSlider = document.getElementById('cust-brightness-slider');

    const drawPreview = () => {
      const ctx = previewCanvas.getContext('2d');
      const W = previewCanvas.width, H = previewCanvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080812';
      ctx.fillRect(0, 0, W, H);

      const hue = parseInt(hueSlider.value, 10);
      const bri = parseInt(brightnessSlider.value, 10);
      const color = `hsl(${hue}, 70%, ${bri}%)`;
      // Sprite size and segment spacing mirror the in-game overlap ratio
      // (in-game: spriteSize≈42px, step≈18px → ~2.3× overlap)
      const sprSz = 72;
      const step  = 34; // px between segment centres

      // 7 segments (6 body + 1 head) centred horizontally in the 300px canvas
      const segCount = 7;
      const totalSpan = (segCount - 1) * step; // 204px
      const startX = Math.round((W - totalSpan) / 2); // 48px

      // Build segment list (left = tail, right = head)
      const segs = [];
      for (let i = 0; i < segCount - 1; i++) {
        segs.push({ x: startX + i * step, y: H / 2, isHead: false, bodyIdx: 1 + (i % 3) });
      }
      segs.push({ x: startX + (segCount - 1) * step, y: H / 2, isHead: true });
      const angle = 0; // facing right
      const rot = angle + SNAKE_SPRITE_ROT_OFFSET;

      // Draw body fills (tail → neck)
      for (let i = 0; i < segs.length - 1; i++) {
        const { x, y, bodyIdx } = segs[i];
        const img = SNAKE_BODY_IMGS[bodyIdx];
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          drawTintedSprite(ctx, img, -sprSz / 2, -sprSz / 2, sprSz, sprSz, color);
          ctx.restore();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, sprSz / 2 * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw body borders
      for (let i = 0; i < segs.length - 1; i++) {
        const { x, y } = segs[i];
        if (SNAKE_BODY_BORDER_IMG.complete && SNAKE_BODY_BORDER_IMG.naturalWidth > 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          drawTintedSprite(ctx, SNAKE_BODY_BORDER_IMG, -sprSz / 2, -sprSz / 2, sprSz, sprSz, color);
          ctx.restore();
        }
      }

      // Draw head fill
      const { x: hx, y: hy } = segs[segs.length - 1];
      if (SNAKE_HEAD_IMG.complete && SNAKE_HEAD_IMG.naturalWidth > 0) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(rot);
        drawTintedSprite(ctx, SNAKE_HEAD_IMG, -sprSz / 2, -sprSz / 2, sprSz, sprSz, color);
        ctx.restore();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hx, hy, sprSz / 2 * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw head border
      if (SNAKE_HEAD_BORDER_IMG.complete && SNAKE_HEAD_BORDER_IMG.naturalWidth > 0) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(rot);
        drawTintedSprite(ctx, SNAKE_HEAD_BORDER_IMG, -sprSz / 2, -sprSz / 2, sprSz, sprSz, color);
        ctx.restore();
      }
    };

    drawPreview();

    hueSlider.addEventListener('input', () => {
      hueVal.textContent = hueSlider.value + '°';
      drawPreview();
    });

    brightnessSlider.addEventListener('input', () => {
      drawPreview();
    });

    const saveAndClose = () => {
      _snakeHue        = parseInt(hueSlider.value, 10);
      _snakeBrightness = parseInt(brightnessSlider.value, 10);
      try { localStorage.setItem('snakeHue', _snakeHue); } catch(_) {}
      try { localStorage.setItem('snakeBrightness', _snakeBrightness); } catch(_) {}
      overlay.remove();
      this._renderOverlay();
    };

    document.getElementById('cust-close-btn').addEventListener('click', saveAndClose);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) saveAndClose();
    });
  }

  _submitScore(score, applesEaten, kills, timePlayed) {
    if (score <= 0) return;
    if (this._debugUsed) return; // debug was active during this run — do not upload
    const sessionId = this._submittedSessionId || null;
    fetch(`${API_SERVER}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, applesEaten, kills: kills || 0, timePlayed: timePlayed || 0, sessionId, token: this._authToken || null }),
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
        const rows = data.entries.map((e, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const safeName = escapeHtml(e.name || 'Anonymous');
          const timeSec  = e.timePlayed || 0;
          const timeFmt  = `${Math.floor(timeSec / 60)}:${String(timeSec % 60).padStart(2, '0')}`;
          return `<tr>`
            + `<td class="lb-rank">${medal}</td>`
            + `<td class="lb-name">${safeName}</td>`
            + `<td class="lb-score">⭐ ${e.score}</td>`
            + `<td class="lb-apples">${APPLE_SPRITE_TAG} ${e.applesEaten}</td>`
            + `<td class="lb-kills">💀 ${e.kills || 0}</td>`
            + `<td class="lb-time">⏱ ${timeFmt}</td>`
            + `</tr>`;
        }).join('');
        el.innerHTML = `<table class="lb-table"><thead><tr>`
          + `<th></th><th>Name</th><th>Score</th><th>Apples</th><th>Kills</th><th>Time</th>`
          + `</tr></thead><tbody>${rows}</tbody></table>`;
      })
      .catch(() => {
        const el = document.getElementById(targetId);
        if (el) el.textContent = 'Leaderboard unavailable';
      });
  }

  _submitNightmareScore(score, applesEaten, kills, timePlayed) {
    if (score <= 0) return;
    if (this._debugUsed) return; // debug was active during this run — do not upload
    const sessionId = this._submittedSessionId || null;
    fetch(`${API_SERVER}/api/nightmare-leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, applesEaten, kills: kills || 0, timePlayed: timePlayed || 0, sessionId, token: this._authToken || null }),
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
        const rows = data.entries.map((e, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const safeName = escapeHtml(e.name || 'Anonymous');
          const timeSec  = e.timePlayed || 0;
          const timeFmt  = `${Math.floor(timeSec / 60)}:${String(timeSec % 60).padStart(2, '0')}`;
          return `<tr>`
            + `<td class="lb-rank">${medal}</td>`
            + `<td class="lb-name">${safeName}</td>`
            + `<td class="lb-score">⭐ ${e.score}</td>`
            + `<td class="lb-apples">${APPLE_SPRITE_TAG} ${e.applesEaten}</td>`
            + `<td class="lb-kills">💀 ${e.kills || 0}</td>`
            + `<td class="lb-time">⏱ ${timeFmt}</td>`
            + `</tr>`;
        }).join('');
        el.innerHTML = `<table class="lb-table lb-table-nightmare"><thead><tr>`
          + `<th></th><th>Name</th><th>Score</th><th>Apples</th><th>Kills</th><th>Time</th>`
          + `</tr></thead><tbody>${rows}</tbody></table>`;
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
    if (this._siteDownJumpscareTimer) { clearTimeout(this._siteDownJumpscareTimer); this._siteDownJumpscareTimer = null; }
    if (this._siteDown && !this._adminToken) {
      // Allow the game to start but schedule a creepy jumpscare after 30 seconds
      this._siteDownJumpscareTimer = setTimeout(() => this._playSiteDownJumpscare(), 30000);
    }
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
      <div class="room-code-display">${escapeHtml(this.onlineRoomCode || '')}</div>
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

      case 'site_going_down':
        if (!this._adminToken) {
          this._siteDown = true;
          this._siteDownSince = msg.downSince || null;
          if (this.phase === 'online_playing' && !this._siteGoingDown) {
            this._siteGoingDown = true;
            this._showShutdownWarning();
          } else if (this.phase !== 'online_playing') {
            this._showMaintenanceScreen(this._siteDownSince);
          }
        }
        break;
    }
  }

  _showOnlineGameOver(winner, scores) {
    this._hideMobileTeleportBtn();

    // If site is going down, show maintenance screen immediately after this round ends
    if (this._siteGoingDown) {
      this._hideShutdownWarning();
      this._showMaintenanceScreen(this._siteDownSince);
      return;
    }

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
    const hudStats = document.getElementById('hud-stats');
    if (hudStats) hudStats.style.display = '';
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
        ws.send(JSON.stringify({ type: 'sp_register', token: this._authToken || null }));
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
      this._spSessionId       = msg.sessionId;
      this._lastTrackedScore  = 0;
      this._lastTrackedApples = 0;
      this._lastTrackedKills  = 0;
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
    if (msg.type === 'site_going_down' && !this._adminToken) {
      this._siteDown = true;
      this._siteDownSince = msg.downSince || null;
      const isPlaying = this.phase === 'playing' || this.phase === 'upgrade';
      if (isPlaying && !this._siteGoingDown) {
        this._siteGoingDown = true;
        this._showShutdownWarning();
      } else if (!isPlaying) {
        this._showMaintenanceScreen(this._siteDownSince);
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
        if (this._adminToken) {
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

    // Site state toggle button
    const siteToggleBtn = document.getElementById('adm-site-toggle');
    if (siteToggleBtn) siteToggleBtn.addEventListener('click', () => this._adminToggleSiteState());

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

    // Set time button
    const setTimeBtn = document.getElementById('adm-set-time');
    if (setTimeBtn) setTimeBtn.addEventListener('click', () => this._adminSetTime());

    // Allow Enter key in set time input
    const timeInput = document.getElementById('adm-time-input');
    if (timeInput) timeInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._adminSetTime(); });

    // Set wave button
    const setWaveBtn = document.getElementById('adm-set-wave');
    if (setWaveBtn) setWaveBtn.addEventListener('click', () => this._adminSetWave());

    // Allow Enter key in set wave input
    const waveInput = document.getElementById('adm-wave-input');
    if (waveInput) waveInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._adminSetWave(); });

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

    // Group toggle buttons (collapse/expand panel sections)
    document.querySelectorAll('.adm-group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = 'adm-group-' + btn.getAttribute('data-group');
        const content = document.getElementById(groupId);
        if (!content) return;
        const opening = content.style.display === 'none';
        content.style.display = opening ? '' : 'none';
        btn.textContent = btn.textContent.replace(/[▸▾]/, opening ? '▾' : '▸');
      });
    });

    // Encircle overlay toggle
    const encircleBtn = document.getElementById('adm-toggle-encircle');
    if (encircleBtn) {
      encircleBtn.addEventListener('click', () => {
        this._debugShowEncircle = !this._debugShowEncircle;
        encircleBtn.textContent = this._debugShowEncircle ? '🐍 Hide Encircle Zone' : '🐍 Show Encircle Zone';
        if (this._debugShowEncircle) this._markDebugUsed();
      });
    }
  }

  _showAdminOpenBtn() {
    const btn = document.getElementById('admin-open-btn');
    if (btn) btn.style.display = '';
  }

  _showFeedbackBtn() {
    const btn = document.getElementById('feedback-open-btn');
    if (btn) btn.style.display = '';
  }

  _openFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    const input = document.getElementById('feedback-input');
    if (input) input.value = '';
    const errEl = document.getElementById('feedback-error');
    if (errEl) errEl.textContent = '';
    modal.style.display = 'flex';
    if (input) setTimeout(() => input.focus(), 50);
  }

  _closeFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (modal) modal.style.display = 'none';
  }

  _submitFeedback() {
    const input  = document.getElementById('feedback-input');
    const errEl  = document.getElementById('feedback-error');
    const submitBtn = document.getElementById('feedback-submit-btn');
    const message = input ? input.value.trim() : '';
    if (!message) {
      if (errEl) errEl.textContent = 'Please enter a message.';
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }
    fetch(`${API_SERVER}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
      .then(r => r.json().then(data => ({ status: r.status, data })))
      .then(({ data }) => {
        if (data.ok) {
          this._closeFeedbackModal();
        } else {
          if (errEl) errEl.textContent = 'Failed to send. Try again.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'SEND'; }
        }
      })
      .catch(() => {
        if (errEl) errEl.textContent = 'Server error. Try again.';
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'SEND'; }
      });
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

  _setupFeedback() {
    const feedbackOpenBtn = document.getElementById('feedback-open-btn');
    if (feedbackOpenBtn) feedbackOpenBtn.addEventListener('click', () => this._openFeedbackModal());

    const cancelBtn = document.getElementById('feedback-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeFeedbackModal());

    const submitBtn = document.getElementById('feedback-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this._submitFeedback());

    const feedbackInput = document.getElementById('feedback-input');
    if (feedbackInput) {
      feedbackInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submitFeedback(); }
        if (e.key === 'Escape') this._closeFeedbackModal();
      });
    }

    const modal = document.getElementById('feedback-modal');
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) this._closeFeedbackModal(); });
    }
  }

  // ── User account / auth ───────────────────────
  _setupAuth() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    // Tab switching
    const tabLogin    = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    if (tabLogin)    tabLogin.addEventListener('click',    () => this._switchAuthTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => this._switchAuthTab('register'));

    // Cancel / backdrop
    const cancelBtn = document.getElementById('auth-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeAuthModal());
    modal.addEventListener('click', e => { if (e.target === modal) this._closeAuthModal(); });

    // Submit
    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this._submitAuth());

    // Enter key on inputs
    for (const id of ['auth-username-input', 'auth-password-input']) {
      const inp = document.getElementById(id);
      if (inp) inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') this._submitAuth();
        if (e.key === 'Escape') this._closeAuthModal();
      });
    }

    // Verify stored token on startup (async — updates overlay if on start screen)
    this._verifyStoredToken();
  }

  _verifyStoredToken() {
    let token;
    try { token = localStorage.getItem('authToken'); } catch(_) {}
    if (!token) return;
    fetch(`${API_SERVER}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (data.ok && data.username) {
          this._authToken       = token;
          this._accountUsername = data.username;
          this._playerName      = data.username;
          if (this.phase === 'start') this._renderOverlay();
        }
      })
      .catch(() => {});
  }

  _openAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    const uInput = document.getElementById('auth-username-input');
    const pInput = document.getElementById('auth-password-input');
    const errEl  = document.getElementById('auth-error');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (errEl)  errEl.textContent = '';
    this._switchAuthTab(tab);
    modal.style.display = 'flex';
    if (uInput) setTimeout(() => uInput.focus(), 50);
  }

  _closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
  }

  _switchAuthTab(tab) {
    const tabLogin    = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const submitBtn   = document.getElementById('auth-submit-btn');
    const noteEl      = document.getElementById('auth-register-note');
    const errEl       = document.getElementById('auth-error');
    if (errEl) errEl.textContent = '';
    if (tab === 'register') {
      if (tabLogin)    tabLogin.classList.remove('active');
      if (tabRegister) tabRegister.classList.add('active');
      if (submitBtn)   submitBtn.textContent = 'CREATE ACCOUNT';
      if (noteEl)      noteEl.style.display = '';
    } else {
      if (tabLogin)    tabLogin.classList.add('active');
      if (tabRegister) tabRegister.classList.remove('active');
      if (submitBtn)   submitBtn.textContent = 'SIGN IN';
      if (noteEl)      noteEl.style.display = 'none';
    }
    this._authCurrentTab = tab;
  }

  _submitAuth() {
    const uInput    = document.getElementById('auth-username-input');
    const pInput    = document.getElementById('auth-password-input');
    const errEl     = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit-btn');
    const username  = uInput ? uInput.value.trim() : '';
    const password  = pInput ? pInput.value : '';
    if (!username) { if (errEl) errEl.textContent = 'Enter a username.'; return; }
    if (!password) { if (errEl) errEl.textContent = 'Enter a password.'; return; }
    const isRegister = this._authCurrentTab === 'register';
    const endpoint   = isRegister ? '/api/auth/register' : '/api/auth/login';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }
    fetch(`${API_SERVER}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then(r => r.json().then(data => ({ status: r.status, data })))
      .then(({ status, data }) => {
        if (data.ok && data.token) {
          this._onAuthSuccess(data.token, data.username);
        } else if (status === 429) {
          if (errEl) errEl.textContent = data.message || 'Too many attempts. Try again later.';
        } else {
          if (errEl) errEl.textContent = data.message || (isRegister ? 'Registration failed.' : 'Incorrect username or password.');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isRegister ? 'CREATE ACCOUNT' : 'SIGN IN';
        }
      })
      .catch(() => {
        if (errEl) errEl.textContent = 'Server error. Try again.';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isRegister ? 'CREATE ACCOUNT' : 'SIGN IN';
        }
      });
  }

  _onAuthSuccess(token, username) {
    this._authToken       = token;
    this._accountUsername = username;
    this._playerName      = username;
    try { localStorage.setItem('authToken', token); } catch(_) {}
    this._closeAuthModal();
    if (this.phase === 'start') this._renderOverlay();
  }

  _logoutAccount() {
    const token = this._authToken;
    this._authToken       = null;
    this._accountUsername = null;
    this._playerName      = '';
    try { localStorage.removeItem('authToken'); } catch(_) {}
    if (token) {
      fetch(`${API_SERVER}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    if (this.phase === 'start') this._renderOverlay();
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
      .then(r => r.json().then(data => ({ status: r.status, data })))
      .then(({ status, data }) => {
        if (data.ok && data.token) {
          this._adminToken = data.token;
          this._closeAdminModal();
          this._openAdminPanel();
        } else if (status === 429) {
          if (errEl) errEl.textContent = data.message || 'Too many attempts. Try again later.';
          if (pwInput) pwInput.value = '';
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
    if (!this._adminToken) { this._openAdminModal(); return; }
    fetch(`${API_SERVER}/api/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.ok) {
          this._adminToken = null;
          this._openAdminModal();
          return;
        }
        const panel = document.getElementById('admin-panel');
        if (panel) { panel.style.display = 'flex'; this._adminPanelOpen = true; }
        // Hide open button while panel is visible
        const openBtn = document.getElementById('admin-open-btn');
        if (openBtn) openBtn.style.display = 'none';
        // Update site toggle button to reflect current state
        this._updateSiteToggleBtn();
        // Load leaderboard entries with delete buttons
        this._loadAdminLeaderboard();
        this._loadAdminNightmareLeaderboard();
        // Load active singleplayer sessions
        this._loadSpSessions();
      })
      .catch(() => {
        this._adminToken = null;
      });
  }

  _closeAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) { panel.style.display = 'none'; this._adminPanelOpen = false; }
    // Show open button again whenever admin mode is active
    if (this._adminToken) {
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
          const timeSec  = e.timePlayed || 0;
          const timeFmt  = `${Math.floor(timeSec / 60)}:${String(timeSec % 60).padStart(2, '0')}`;
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px 0;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName} — ⭐${e.score} 🍎${e.applesEaten} 💀${e.kills || 0} ⏱${timeFmt}</span>
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
          const timeSec  = e.timePlayed || 0;
          const timeFmt  = `${Math.floor(timeSec / 60)}:${String(timeSec % 60).padStart(2, '0')}`;
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px 0;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName} — ⭐${e.score} 🍎${e.applesEaten} 💀${e.kills || 0} ⏱${timeFmt}</span>
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
              <button class="adm-sp-btn" data-sid="${s.sessionId}" data-cmd="sp_spawn_apple" style="${btnStyle}">${APPLE_SPRITE_TAG} Apples</button>
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
      statsEl.innerHTML = `Score: ${score}  ·  🛡 ${shields}  ·  ${APPLE_SPRITE_TAG} ${apples}${nm}${upg}`;
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

  _markDebugUsed() {
    if (this.phase === 'playing' || this.phase === 'paused') this._debugUsed = true;
  }

  _adminAction(action) {
    if (!this._adminToken) { console.warn('Skid get a job'); return; }
    // Mark debug as used for the current run so the score won't be uploaded
    this._markDebugUsed();
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

  _adminSetTime() {
    if (!this._adminToken) { console.warn('Skid get a job'); return; }
    this._markDebugUsed();
    const input = document.getElementById('adm-time-input');
    if (!input) return;
    const val = input.value.trim();
    let totalSecs = 0;
    if (val.includes(':')) {
      const parts = val.split(':');
      totalSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } else {
      totalSecs = parseInt(val, 10);
    }
    if (isNaN(totalSecs) || totalSecs < 0) return;
    const desiredMs = totalSecs * 1000;
    const now = performance.now();
    this.gameStartTime = now - desiredMs - (this._totalPausedMs || 0);
    this._updateHUD();
    this._flashAdminBtn('adm-set-time', '⏱ Time Set!');
  }

  _adminSetWave() {
    if (!this._adminToken) { console.warn('Skid get a job'); return; }
    this._markDebugUsed();
    const input = document.getElementById('adm-wave-input');
    if (!input) return;
    const waveNum = parseInt(input.value, 10);
    if (isNaN(waveNum) || waveNum < 0) return;
    const s = this.state;
    if (!s) return;
    s.waveCount = waveNum;
    // Recompute waveSpawnCap for the target wave (cap starts at 10, ×1.5 per wave)
    let cap = 10;
    for (let i = 0; i < waveNum; i++) cap = Math.min(Math.floor(cap * 1.5), 50);
    s.waveSpawnCap = cap;
    // End any active wave so the next one starts fresh
    s.enemies = [];
    s.waveSpawnedCount = 0;
    s.waveHadEnemies = false;
    s.waveBreakUntil = (s.elapsedMs || 0);
    this._updateHUD();
    this._flashAdminBtn('adm-set-wave', '🌊 Wave Set!');
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

  _updateDebugCounters() {
    if (!this._adminPanelOpen || !this.state || this.phase !== 'playing') return;
    const enemyEl = document.getElementById('adm-debug-enemies');
    const waveEl  = document.getElementById('adm-debug-wave');
    if (!enemyEl && !waveEl) return;
    const s = this.state;
    const elapsedMs = s.elapsedMs != null
      ? s.elapsedMs
      : Math.max(0, performance.now() - (this.gameStartTime || 0) - (this._totalPausedMs || 0));
    const targetCount = Math.min(
      getTargetEnemyCount(elapsedMs, s.nightmareMode),
      s.waveSpawnCap
    );
    if (enemyEl) {
      enemyEl.textContent = `Enemies: ${s.enemies.length} / ${targetCount} (spawned: ${s.waveSpawnedCount || 0}/${s.waveSpawnCap})`;
    }
    if (waveEl) {
      let waveStatus;
      if (s.enemies.length > 0) {
        waveStatus = 'ONGOING';
      } else if (elapsedMs < s.waveBreakUntil) {
        const remainSec = ((s.waveBreakUntil - elapsedMs) / 1000).toFixed(1);
        waveStatus = `DOWNTIME (${remainSec}s)`;
      } else {
        waveStatus = 'CLEAR';
      }
      waveEl.textContent = `Wave #${s.waveCount || 0} | ${waveStatus}`;
    }
    const warnEl = document.getElementById('adm-debug-warn');
    if (warnEl) warnEl.style.display = this._debugUsed ? '' : 'none';
  }

  _drawEncircleOverlay(ctx, state) {
    if (!this._debugShowEncircle || !state) return;
    const head  = state.snake[0];
    const snake = state.snake;

    // Compute bounding box of all snake segments with 1-cell padding so the
    // flood-fill area encompasses the entire snake, even when parts of the body
    // lie outside the visible viewport.
    let fMinX = Math.round(snake[0].x), fMaxX = fMinX;
    let fMinY = Math.round(snake[0].y), fMaxY = fMinY;
    for (const s of snake) {
      const rx = Math.round(s.x), ry = Math.round(s.y);
      if (rx < fMinX) fMinX = rx; if (rx > fMaxX) fMaxX = rx;
      if (ry < fMinY) fMinY = ry; if (ry > fMaxY) fMaxY = ry;
    }
    fMinX -= 1; fMaxX += 1; fMinY -= 1; fMaxY += 1;

    // Viewport bounds — used only to limit which cells we actually draw.
    const halfC = Math.floor(VIEW_COLS / 2);
    const halfR = Math.floor(VIEW_ROWS / 2);
    const vMinX = Math.round(head.x) - halfC;
    const vMaxX = Math.round(head.x) + halfC;
    const vMinY = Math.round(head.y) - halfR;
    const vMaxY = Math.round(head.y) + halfR;

    // Discretise snake body into a set of occupied grid cells
    const snakeSet = new Set(snake.map(s => `${Math.round(s.x)},${Math.round(s.y)}`));

    // Flood-fill from all snake-bbox edge cells to find the reachable (non-encircled) cells.
    // Using the full snake bounding box (rather than only the viewport) ensures that body
    // segments outside the viewport still act as walls in the flood-fill.
    const reachable = new Set();
    const queue = [];
    const enqueue = (x, y) => {
      if (x < fMinX || x > fMaxX || y < fMinY || y > fMaxY) return;
      const key = `${x},${y}`;
      if (!snakeSet.has(key) && !reachable.has(key)) {
        reachable.add(key);
        queue.push([x, y]);
      }
    };
    for (let x = fMinX; x <= fMaxX; x++) { enqueue(x, fMinY); enqueue(x, fMaxY); }
    for (let y = fMinY + 1; y < fMaxY; y++) { enqueue(fMinX, y); enqueue(fMaxX, y); }
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const [cx, cy] = queue[queueIndex++];
      enqueue(cx + 1, cy); enqueue(cx - 1, cy);
      enqueue(cx, cy + 1); enqueue(cx, cy - 1);
    }

    // Highlight cells that are inside the snake's loop (drawing limited to viewport).
    ctx.save();
    ctx.fillStyle = 'rgba(0, 200, 255, 0.18)';
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth = 0.5;
    for (let x = vMinX; x <= vMaxX; x++) {
      for (let y = vMinY; y <= vMaxY; y++) {
        const key = `${x},${y}`;
        if (!snakeSet.has(key) && !reachable.has(key)) {
          ctx.fillRect(x * GRID, y * GRID, GRID, GRID);
          ctx.strokeRect(x * GRID, y * GRID, GRID, GRID);
        }
      }
    }
    ctx.restore();
  }

  _triggerUpgradeChoice() {
    if (!this.state) return;
    const s = this.state;
    const pool = UPGRADES.filter(u => {
      if (u.oneTime && s.upgradeCount[u.id]) return false;
      if (u.id === 'shield' && (s.shields || 0) > 0) return false;
      return true;
    });
    const choices = pickRandom(pool, s.oracle ? 4 : 3);
    if (!choices.length) return;
    this.pendingUpgrades = choices;
    this.phase = 'upgrade';
    this._showUpgradePanel();
  }

  // ── Mobile warning screen ─────────────────────
  _showMobileWarningIfNeeded() {
    if (this._mobileWarningShown) return;
    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 640;
    if (!isMobile) return;
    const modal = document.getElementById('mobile-warning-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const continueBtn = document.getElementById('mobile-warning-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        this._mobileWarningShown = true;
      }, { once: true });
    }
  }

  // ── Greeting screen ───────────────────────────
  _showGreetingIfNeeded() {
    this._showMobileWarningIfNeeded();
    let shown;
    try { shown = localStorage.getItem('greetingShown_v2'); } catch(_) {}
    if (shown) return;
    const modal = document.getElementById('greeting-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const enterBtn = document.getElementById('greeting-enter-btn');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        try { localStorage.setItem('greetingShown_v2', '1'); } catch(_) {}
      }, { once: true });
    }
    const tosBtn = document.getElementById('greeting-tos-btn');
    if (tosBtn) tosBtn.addEventListener('click', () => this._openLegalModal('tos'));
    const ppBtn = document.getElementById('greeting-pp-btn');
    if (ppBtn) ppBtn.addEventListener('click', () => this._openLegalModal('pp'));
    // Also dismiss on backdrop click
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.style.display = 'none';
        try { localStorage.setItem('greetingShown_v2', '1'); } catch(_) {}
      }
    });
  }

  // ── Legal viewer ──────────────────────────────
  _openLegalModal(type) {
    const modal = document.getElementById('legal-modal');
    const titleEl = document.getElementById('legal-modal-title');
    const contentEl = document.getElementById('legal-modal-content');
    if (!modal || !titleEl || !contentEl) return;
    const isToS = type === 'tos';
    titleEl.textContent = isToS ? '📄 TERMS OF SERVICE' : '🔒 PRIVACY POLICY';
    contentEl.textContent = 'Loading…';
    modal.style.display = 'flex';
    const url = isToS ? '/Legal/ToS' : '/Legal/Privacy%20Policy';
    fetch(url)
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(text => { contentEl.textContent = text; })
      .catch(() => { contentEl.textContent = 'Unable to load document.'; });
    const closeBtn = document.getElementById('legal-modal-close');
    const close = () => { modal.style.display = 'none'; };
    closeBtn.onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
  }

  // ── Site state ────────────────────────────────
  _checkSiteState(fromPoll = false) {
    fetch(`${API_SERVER}/api/site-state`)
      .then(r => r.ok ? r.json() : { down: false })
      .then(data => {
        this._siteDown = !!data.down;
        if (this._siteDown && !this._adminToken) {
          const isPlaying = this.phase === 'playing' || this.phase === 'online_playing' || this.phase === 'upgrade';
          if (isPlaying && !this._siteGoingDown) {
            this._siteGoingDown = true;
            this._siteDownSince = data.downSince || null;
            this._showShutdownWarning();
            // Schedule jumpscare for players who snuck in during downtime via reload exploit
            if (!this._siteDownJumpscareTimer) {
              this._siteDownJumpscareTimer = setTimeout(() => this._playSiteDownJumpscare(), 30000);
            }
          } else if (!isPlaying) {
            this._showMaintenanceScreen(data.downSince);
          }
        } else if (!fromPoll) {
          this._showGreetingIfNeeded();
        }
      })
      .catch(() => {
        if (!fromPoll) this._showGreetingIfNeeded();
      });
  }

  _showMaintenanceScreen(downSince) {
    this._siteDown = true;
    const overlay = document.getElementById('site-down-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Clear any existing timer
    if (this._siteDownTimer) { clearInterval(this._siteDownTimer); this._siteDownTimer = null; }

    const sinceMs = downSince ? new Date(downSince).getTime() : Date.now();
    const timerEl = document.getElementById('site-down-timer');

    const updateTimer = () => {
      if (!timerEl) return;
      const elapsed = Math.floor((Date.now() - sinceMs) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      timerEl.textContent =
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0');
    };
    updateTimer();
    this._siteDownTimer = setInterval(updateTimer, 1000);

    // Draw the sleeping snake canvas
    this._startSleepingSnakeAnimation();

    // Update admin panel button label if panel is open
    this._updateSiteToggleBtn();
  }

  _startSleepingSnakeAnimation() {
    const canvas = document.getElementById('sleeping-snake-canvas');
    if (!canvas) return;
    if (this._sleepSnakeRaf) { cancelAnimationFrame(this._sleepSnakeRaf); this._sleepSnakeRaf = null; }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Straight horizontal snake geometry
    const cy     = H / 2;
    const headX  = W - H / 2;          // head circle center X
    const headR  = H * 0.38;           // head radius
    const lineW  = H * 0.36;           // body thickness
    const bodyX0 = 4;                  // body start X (tail end)
    const bodyX1 = headX - headR + 2;  // body end X (meets head)
    const nSeg   = 10;                 // number of body colour segments

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Body – segments drawn tail→head so head is on top
      ctx.save();
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lineW;
      for (let i = nSeg - 1; i >= 0; i--) {
        const x0 = bodyX0 + (i       / nSeg) * (bodyX1 - bodyX0);
        const x1 = bodyX0 + ((i + 1) / nSeg) * (bodyX1 - bodyX0);
        const alpha = 0.3 + 0.7 * (1 - i / (nSeg - 1));
        ctx.strokeStyle = `rgba(40, 160, 80, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x0, cy);
        ctx.lineTo(x1, cy);
        ctx.stroke();
      }
      ctx.restore();

      // Head glow + fill
      ctx.save();
      ctx.shadowBlur  = _fxEnabled ? 12 : 0;
      ctx.shadowColor = '#4f8';
      ctx.fillStyle   = '#50e678';
      ctx.beginPath();
      ctx.arc(headX, cy, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Closed eyes – short horizontal strokes curved downward
      const eyeR    = headR * 0.28;
      const eyeDist = headR * 0.52;
      ctx.strokeStyle = '#0a0a14';
      ctx.lineWidth   = eyeR * 0.85;
      ctx.lineCap     = 'round';
      [-1, 1].forEach(side => {
        const ex = headX + side * eyeDist;
        const ey = cy + eyeR * 0.15;
        ctx.beginPath();
        ctx.moveTo(ex - eyeR, ey - eyeR * 0.25);
        ctx.quadraticCurveTo(ex, ey + eyeR * 0.5, ex + eyeR, ey - eyeR * 0.25);
        ctx.stroke();
      });
      ctx.restore();

      this._sleepSnakeRaf = requestAnimationFrame(draw);
    };

    this._sleepSnakeRaf = requestAnimationFrame(draw);
  }

  _hideMaintenanceScreen() {
    this._siteDown = false;
    this._siteGoingDown = false;
    this._siteDownSince = null;
    if (this._siteDownTimer) { clearInterval(this._siteDownTimer); this._siteDownTimer = null; }
    if (this._siteDownJumpscareTimer) { clearTimeout(this._siteDownJumpscareTimer); this._siteDownJumpscareTimer = null; }
    if (this._sleepSnakeRaf) { cancelAnimationFrame(this._sleepSnakeRaf); this._sleepSnakeRaf = null; }
    const overlay = document.getElementById('site-down-overlay');
    if (overlay) overlay.style.display = 'none';
    this._hideShutdownWarning();
    this._updateSiteToggleBtn();
    this._showGreetingIfNeeded();
  }

  _showShutdownWarning() {
    const el = document.getElementById('shutdown-warning');
    if (!el) return;
    el.textContent = '⚠ SITE GOING OFFLINE AFTER THIS ROUND — PLAY ON!';
    el.style.display = 'block';
    if (this._shutdownWarningTimeout) clearTimeout(this._shutdownWarningTimeout);
    this._shutdownWarningTimeout = setTimeout(() => this._hideShutdownWarning(), 15000);
  }

  _hideShutdownWarning() {
    if (this._shutdownWarningTimeout) { clearTimeout(this._shutdownWarningTimeout); this._shutdownWarningTimeout = null; }
    const el = document.getElementById('shutdown-warning');
    if (el) el.style.display = 'none';
  }

  _updateSiteToggleBtn() {
    const btn = document.getElementById('adm-site-toggle');
    if (!btn) return;
    if (this._siteDown) {
      btn.innerHTML = '🟢 Site Up';
      btn.style.borderColor = '#3a6';
      btn.style.color = '#4f8';
    } else {
      btn.innerHTML = '🔴 Site Down';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }

  _adminToggleSiteState() {
    if (!this._adminToken) return;
    const btn = document.getElementById('adm-site-toggle');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const newDown = !this._siteDown;
    fetch(`${API_SERVER}/api/admin/site-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this._adminToken, down: newDown }),
    })
      .then(r => r.json())
      .then(data => {
        if (btn) btn.disabled = false;
        if (data.ok) {
          if (data.down) {
            this._showMaintenanceScreen(data.downSince);
          } else {
            this._hideMaintenanceScreen();
          }
        } else {
          this._updateSiteToggleBtn();
        }
      })
      .catch(() => {
        if (btn) btn.disabled = false;
        this._updateSiteToggleBtn();
      });
  }
}

// ── Boot ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  new SnakeRogue();
});
