// ─────────────────────────────────────────────
//  SNAKE ROGUELIKE — game.js
// ─────────────────────────────────────────────

const GRID = 20;          // cell size in pixels
const COLS = 30;
const ROWS = 30;
const W = COLS * GRID;
const H = ROWS * GRID;

// ── Upgrade definitions ─────────────────────
const UPGRADES = [
  {
    id: 'speed_up',
    name: 'OVERDRIVE',
    icon: '⚡',
    desc: 'Move faster. Stack for ludicrous speed.',
    apply(state) { state.baseInterval = Math.max(60, state.baseInterval - 18); }
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
    desc: 'Walls wrap around. No more wall death.',
    apply(state) { state.ghost = (state.ghost || 0) + 1; }
  },
  {
    id: 'short_tail',
    name: 'TRIM',
    icon: '✂️',
    desc: 'Shrinks your tail by 3. Fewer self-collisions.',
    apply(state) {
      const cut = Math.min(3, state.snake.length - 1);
      state.snake.splice(state.snake.length - cut, cut);
      state.growBuffer = Math.max(0, (state.growBuffer || 0) - 3);
    }
  },
  {
    id: 'less_grow',
    name: 'DIET',
    icon: '🥗',
    desc: 'Each apple grows tail by 1 less (min 0).',
    apply(state) { state.growPerApple = Math.max(0, (state.growPerApple ?? 2) - 1); }
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
];

// ── Helpers ──────────────────────────────────
function randInt(n) { return Math.floor(Math.random() * n); }

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
    ...state.snake.map(s => `${s.x},${s.y}`),
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
  state.apples.push(emptyCell(state));
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
    speed: 0.045,
    score: 5,
    label: 'CHASER',
    update(e, state) {
      const head = state.snake[0];
      const dx = head.x - e.x;
      const dy = head.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = e.speed * (1 / (1 + (state.freeze || 0) * 0.25));
      e.x += (dx / len) * spd;
      e.y += (dy / len) * spd;
    }
  },
  patrol: {
    color: '#c07020',
    glowColor: 'rgba(200,120,30,0.4)',
    size: 0.65,
    speed: 0.055,
    score: 8,
    label: 'PATROLLER',
    init(e) {
      e.angle = Math.random() * Math.PI * 2;
      e.turnTimer = 0;
    },
    update(e, state) {
      e.turnTimer = (e.turnTimer || 0) + 1;
      if (e.turnTimer > 40 + randInt(40)) {
        e.angle += (Math.random() - 0.5) * Math.PI;
        e.turnTimer = 0;
      }
      const spd = e.speed * (1 / (1 + (state.freeze || 0) * 0.25));
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
    speed: 0.065,
    score: 12,
    label: 'INTERCEPTOR',
    update(e, state) {
      // Predict where the snake head will be in ~8 ticks
      const head = state.snake[0];
      const dir = state.direction;
      const predict = { x: head.x + dir.x * 8, y: head.y + dir.y * 8 };
      const dx = predict.x - e.x;
      const dy = predict.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = e.speed * (1 / (1 + (state.freeze || 0) * 0.25));
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
  if (score >= 15) typeKeys.push('patrol');
  if (score >= 30) typeKeys.push('interceptor');
  if (score >= 50) typeKeys.push('blocker');

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
    speed: type.speed * (1 + score / 120),
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
function drawGrid(ctx) {
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * GRID, 0); ctx.lineTo(x * GRID, H); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * GRID); ctx.lineTo(W, y * GRID); ctx.stroke();
  }
}

function drawSnake(ctx, state) {
  const snake = state.snake;
  for (let i = snake.length - 1; i >= 0; i--) {
    const s = snake[i];
    const t = i / snake.length;
    const alpha = 0.4 + 0.6 * (1 - t);
    // Shield tint
    if (i === 0 && state.shields > 0) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#4af';
    } else if (i === 0) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#4f8';
    } else {
      ctx.shadowBlur = 0;
    }
    if (state.tailSweep && i > 0) {
      ctx.fillStyle = `rgba(100, 220, 255, ${alpha})`;
    } else {
      ctx.fillStyle = i === 0
        ? `rgba(80, 230, 120, ${alpha})`
        : `rgba(40, 160, 80, ${alpha})`;
    }
    const pad = i === 0 ? 1 : 2;
    ctx.fillRect(s.x * GRID + pad, s.y * GRID + pad, GRID - pad * 2, GRID - pad * 2);
  }
  ctx.shadowBlur = 0;
}

function drawApples(ctx, state, tick) {
  for (const apple of state.apples) {
    const pulse = 0.85 + 0.15 * Math.sin(tick * 0.08);
    const r = GRID * 0.38 * pulse;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#f64';
    ctx.fillStyle = '#e84';
    ctx.beginPath();
    ctx.arc(apple.x * GRID + GRID / 2, apple.y * GRID + GRID / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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

// ── Main Game Class ───────────────────────────
class SnakeRogue {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = W;
    this.canvas.height = H;

    this.state = null;
    this.phase = 'start'; // 'start' | 'playing' | 'upgrade' | 'gameover'
    this.pendingUpgrades = [];
    this.tick = 0;
    this.particles = [];
    this.lastMoveTime = 0;
    this.flashTimer = 0;

    this._keys = {};
    this._setupInput();
    this._loop = this._gameLoop.bind(this);
    requestAnimationFrame(this._loop);

    this._renderOverlay();
  }

  _setupInput() {
    document.addEventListener('keydown', e => {
      this._keys[e.key] = true;

      if (this.phase === 'playing') {
        const dirMap = {
          ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
          ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
        };
        const newDir = dirMap[e.key];
        if (newDir && this.state) {
          const cur = this.state.direction;
          // Prevent reversing
          if (!(newDir.x === -cur.x && newDir.y === -cur.y)) {
            this.state.nextDirection = newDir;
          }
        }
      }

      if (this.phase === 'start' && e.key === 'Enter') this._startGame();
      if (this.phase === 'gameover' && e.key === 'Enter') this._startGame();
      if (this.phase === 'gameover' && e.key === 'r') this._startGame();
    });
  }

  _startGame() {
    this.particles = [];
    this.tick = 0;
    this.lastMoveTime = 0;
    this.flashTimer = 0;

    this.state = {
      snake: [
        { x: 10, y: 15 },
        { x: 9, y: 15 },
        { x: 8, y: 15 },
      ],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
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
      upgradeCount: {},
      enemySpawnTimer: 0,
      enemySpawnInterval: 220,
    };

    // Initial apples
    spawnApple(this.state);
    spawnApple(this.state);

    this.phase = 'playing';
    this._hideOverlay();
    this._hideUpgradePanel();
    this._updateHUD();
  }

  _update(timestamp) {
    if (this.phase !== 'playing') return;
    const state = this.state;

    // Move timing
    const interval = state.baseInterval;
    if (timestamp - this.lastMoveTime < interval) return;
    this.lastMoveTime = timestamp;
    this.tick++;

    // Apply direction
    state.direction = state.nextDirection;

    const head = state.snake[0];
    let nx = head.x + state.direction.x;
    let ny = head.y + state.direction.y;

    // Wall collision
    if (state.ghost > 0) {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    } else {
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        this._die('wall');
        return;
      }
    }

    // Self collision
    const hitSelf = state.snake.some((s, i) => i > 0 && s.x === nx && s.y === ny);
    if (hitSelf) {
      this._die('self');
      return;
    }

    // Move snake
    state.snake.unshift({ x: nx, y: ny });
    if (state.growBuffer > 0) {
      state.growBuffer--;
    } else {
      state.snake.pop();
    }

    // Magnet: pull apples closer
    if (state.magnet > 0) {
      for (const apple of state.apples) {
        const dx = nx - apple.x;
        const dy = ny - apple.y;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist > 1 && this.tick % Math.max(1, 4 - state.magnet) === 0) {
          if (Math.abs(dx) > Math.abs(dy)) apple.x += Math.sign(dx);
          else apple.y += Math.sign(dy);
        }
      }
    }

    // Apple eating
    for (let i = state.apples.length - 1; i >= 0; i--) {
      const apple = state.apples[i];
      if (apple.x === nx && apple.y === ny) {
        state.apples.splice(i, 1);
        state.score += state.scoreMult;
        state.applesEaten++;
        state.growBuffer += state.growPerApple;
        spawnParticles(this.particles, nx, ny, '#e84', 12);

        // Always keep at least 1 apple on field
        spawnApple(state);
        for (let j = 0; j < state.extraApples; j++) spawnApple(state);

        // Trigger upgrade screen
        this.pendingUpgrades = pickUpgrades(state);
        this.phase = 'upgrade';
        this._showUpgradePanel();
        this._updateHUD();
        return;
      }
    }

    // Enemy updates
    state.enemySpawnTimer++;
    const difficulty = 1 + state.score / 40;
    const spawnInterval = Math.max(60, state.enemySpawnInterval / difficulty);
    if (state.enemySpawnTimer >= spawnInterval && state.score >= 3) {
      state.enemySpawnTimer = 0;
      spawnEnemy(state);
    }

    for (const e of state.enemies) {
      ENEMY_TYPES[e.type].update(e, state);

      // Wrap enemies too for fairness
      e.x = (e.x + COLS * 2) % COLS;
      e.y = (e.y + ROWS * 2) % ROWS;
    }

    // Enemy collision with head
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const ex = Math.round(e.x);
      const ey = Math.round(e.y);
      if (ex === nx && ey === ny) {
        if (state.shields > 0) {
          state.shields--;
          spawnParticles(this.particles, nx, ny, '#4af', 16);
          state.enemies.splice(i, 1);
          this.flashTimer = 20;
          continue;
        }
        this._die('enemy');
        return;
      }
      // Tail kills enemy
      if (state.tailSweep > 0) {
        const hitTail = state.snake.slice(1).some(s => s.x === ex && s.y === ey);
        if (hitTail) {
          spawnParticles(this.particles, ex, ey, '#c0f', 10);
          state.score += ENEMY_TYPES[e.type].score;
          state.enemies.splice(i, 1);
        }
      }
    }

    this._updateHUD();
  }

  _die(reason) {
    const state = this.state;
    spawnParticles(this.particles, state.snake[0].x, state.snake[0].y, '#f44', 20);
    this.phase = 'gameover';
    this._showOverlay('gameover', reason);
  }

  _chooseUpgrade(upgrade) {
    const state = this.state;
    upgrade.apply(state);
    state.upgradeCount[upgrade.id] = (state.upgradeCount[upgrade.id] || 0) + 1;
    this._hideUpgradePanel();
    this.phase = 'playing';
    this._updateHUD();
  }

  _updateHUD() {
    if (!this.state) return;
    const s = this.state;
    document.getElementById('hud-score').textContent = s.score;
    document.getElementById('hud-apples').textContent = s.applesEaten;
    document.getElementById('hud-shields').textContent = s.shields;
    document.getElementById('hud-speed').textContent = Math.round(1000 / s.baseInterval * 10) / 10;

    // Build upgrade summary
    const parts = [];
    if (s.ghost) parts.push(`👻×${s.ghost}`);
    if (s.shields) parts.push(`🛡️×${s.shields}`);
    if (s.magnet) parts.push(`🧲×${s.magnet}`);
    if (s.freeze) parts.push(`❄️×${s.freeze}`);
    if (s.scoreMult > 1) parts.push(`💰×${s.scoreMult}`);
    if (s.tailSweep) parts.push(`🌀×${s.tailSweep}`);
    if (s.repel) parts.push(`💥×${s.repel}`);
    if (s.extraApples) parts.push(`🍎+${s.extraApples}`);
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

    drawGrid(ctx);

    if (!state) return;

    // Draw elements
    drawApples(ctx, state, this.tick);
    drawSnake(ctx, state);
    drawEnemies(ctx, state, this.tick);

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
        <div class="controls">WASD / ↑↓←→ to move</div>
      `;
      document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
    }
  }

  _renderOverlay() {
    const el = document.getElementById('overlay');
    el.className = 'start';
    el.innerHTML = `
      <h1>VIPER.exe</h1>
      <div class="info">
        A roguelike snake<br>
        Eat apples → choose upgrades → survive<br>
        Enemies grow stronger with each apple
      </div>
      <div class="controls">
        WASD / Arrow Keys to move<br>
        Enemies appear at score 3+<br>
        Upgrades stack infinitely
      </div>
      <button class="btn" id="start-btn">START [Enter]</button>
    `;
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
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
}

// ── Boot ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new SnakeRogue();
});
