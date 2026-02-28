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

// ── Site state ────────────────────────────────
// Persisted to admin_settings table under key 'site_state'
let siteState = { down: false, downSince: null };

// ── User authentication ───────────────────────
const USER_SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

// ── Brute-force protection ────────────────────
const loginAttempts = new Map(); // IP → { count, resetAt }
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return { allowed: true };
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_LOCKOUT_MS });
  } else {
    entry.count++;
  }
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// ── Admin audit logging ───────────────────────
function logAdminEvent(eventType, ip, details) {
  const entry = { timestamp: new Date().toISOString(), ip, ...details };
  console.warn('[ADMIN LOG]', eventType, entry);
  if (dbPool) {
    dbPool.query(
      `INSERT INTO admin_logs (event_type, ip, details) VALUES ($1, $2, $3)`,
      [eventType, ip, JSON.stringify(details)]
    ).catch(err => console.error('[ADMIN LOG] DB insert error:', err.message));
  }
}

// Collect every technically available piece of information from an HTTP request.
// Never includes the raw password — only metadata useful for threat analysis.
function collectRequestFingerprint(req, extra) {
  const h = req.headers;
  const sock = req.socket || {};
  const entry = loginAttempts.get(
    (h['x-forwarded-for'] || '').split(',')[0].trim() || sock.remoteAddress || 'unknown'
  );
  return {
    // ── Standard headers ──────────────────────────
    userAgent:               h['user-agent']               || null,
    accept:                  h['accept']                   || null,
    acceptLanguage:          h['accept-language']          || null,
    acceptEncoding:          h['accept-encoding']          || null,
    contentType:             h['content-type']             || null,
    contentLength:           h['content-length']           || null,
    connection:              h['connection']               || null,
    cacheControl:            h['cache-control']            || null,
    pragma:                  h['pragma']                   || null,
    host:                    h['host']                     || null,
    origin:                  h['origin']                   || null,
    referer:                 h['referer']                  || null,
    dnt:                     h['dnt']                      || null,
    upgradeInsecureRequests: h['upgrade-insecure-requests'] || null,
    xRequestedWith:          h['x-requested-with']         || null,
    // ── Fetch metadata (modern browsers) ─────────
    secFetchSite:            h['sec-fetch-site']           || null,
    secFetchMode:            h['sec-fetch-mode']           || null,
    secFetchDest:            h['sec-fetch-dest']           || null,
    secFetchUser:            h['sec-fetch-user']           || null,
    // ── Client hints ─────────────────────────────
    secChUa:                 h['sec-ch-ua']                || null,
    secChUaMobile:           h['sec-ch-ua-mobile']         || null,
    secChUaPlatform:         h['sec-ch-ua-platform']       || null,
    secChUaArch:             h['sec-ch-ua-arch']           || null,
    secChUaBitness:          h['sec-ch-ua-bitness']        || null,
    secChUaFullVersionList:  h['sec-ch-ua-full-version-list'] || null,
    secChUaModel:            h['sec-ch-ua-model']          || null,
    // ── Proxy / forwarding headers ────────────────
    xForwardedFor:           h['x-forwarded-for']          || null,
    xForwardedProto:         h['x-forwarded-proto']        || null,
    xForwardedHost:          h['x-forwarded-host']         || null,
    xRealIp:                 h['x-real-ip']                || null,
    xClientIp:               h['x-client-ip']              || null,
    xClusterClientIp:        h['x-cluster-client-ip']      || null,
    trueClientIp:            h['true-client-ip']           || null,
    forwarded:               h['forwarded']                || null,
    via:                     h['via']                      || null,
    // ── Cloudflare headers ────────────────────────
    cfConnectingIp:          h['cf-connecting-ip']         || null,
    cfIpCountry:             h['cf-ipcountry']             || null,
    cfRay:                   h['cf-ray']                   || null,
    cfVisitor:               h['cf-visitor']               || null,
    // ── Fastly / other CDN headers ────────────────
    fastlyClientIp:          h['fastly-client-ip']         || null,
    xAmznTraceId:            h['x-amzn-trace-id']          || null,
    // ── TCP / socket metadata ─────────────────────
    socketRemoteAddress:     sock.remoteAddress            || null,
    socketRemotePort:        sock.remotePort               || null,
    socketLocalAddress:      sock.localAddress             || null,
    socketLocalPort:         sock.localPort                || null,
    socketEncrypted:         !!(sock.encrypted),
    // ── HTTP protocol metadata ────────────────────
    httpVersion:             req.httpVersion               || null,
    method:                  req.method                    || null,
    // ── Contextual ───────────────────────────────
    failedAttemptCount:      entry ? entry.count : 0,
    ...extra,
  };
}

// ── Password hashing (scrypt) ─────────────────
function hashPasswordLegacy(pw) {
  // SHA-256 — used only for migrating old stored hashes
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

function generatePasswordHash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(pw, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, expected] = parts;
  try {
    const computed = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) { return false; }
}

// Detect use of the old legacy SHA-256 password; returns true if the submitted
// password matches a stored legacy (non-scrypt) hash.
function isLegacyPasswordMatch(pw, storedHash) {
  if (!storedHash || storedHash.startsWith('scrypt:')) return false;
  try {
    const computed = hashPasswordLegacy(pw);
    if (computed.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch (_) { return false; }
}

// Admin password MUST be supplied via the ADMIN_PASSWORD environment variable.
if (!process.env.ADMIN_PASSWORD) {
  console.error('[ADMIN] ADMIN_PASSWORD environment variable is not set. Admin login will be disabled until it is provided.');
}

// Pre-computed hash for the no-DB fallback (scrypt, regenerated each start).
// If ADMIN_PASSWORD is unset this is null and all login attempts will be rejected.
const DEFAULT_ADMIN_HASH = process.env.ADMIN_PASSWORD
  ? generatePasswordHash(process.env.ADMIN_PASSWORD)
  : null;

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

async function upgradePasswordHash(newHash) {
  if (!dbPool) return;
  await dbPool.query(
    `INSERT INTO admin_settings (key, value)
     VALUES ('password_hash', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [newHash]
  );
}

async function initDb() {
  if (!dbPool) { console.warn('DATABASE_URL not set -- leaderboard persistence disabled.'); return; }
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id           SERIAL       PRIMARY KEY,
      name         VARCHAR(30)  NOT NULL,
      score        INTEGER      NOT NULL DEFAULT 0,
      apples_eaten INTEGER      NOT NULL DEFAULT 0,
      date         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate existing leaderboard table: add id column if missing (old schema used name as PK)
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leaderboard' AND column_name = 'id'
      ) THEN
        ALTER TABLE leaderboard ADD COLUMN id SERIAL;
      END IF;
    END $$
  `).catch(() => {}); 
  // Drop old primary key on name if still present, then add id as primary key
  await dbPool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'leaderboard'::regclass AND contype = 'p'
          AND conname = 'leaderboard_pkey'
          AND array_to_string(
            ARRAY(SELECT attname FROM pg_attribute
                  WHERE attrelid = 'leaderboard'::regclass
                    AND attnum = ANY(conkey)),
            ',') = 'name'
      ) THEN
        ALTER TABLE leaderboard DROP CONSTRAINT leaderboard_pkey;
        ALTER TABLE leaderboard ADD PRIMARY KEY (id);
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_name_unique
      ON leaderboard (name)
      WHERE name != 'Anonymous'
  `);
  // Migrate: add kills and time_played columns to leaderboard if missing
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leaderboard' AND column_name = 'kills'
      ) THEN
        ALTER TABLE leaderboard ADD COLUMN kills INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leaderboard' AND column_name = 'time_played'
      ) THEN
        ALTER TABLE leaderboard ADD COLUMN time_played INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key   VARCHAR(50)  PRIMARY KEY,
      value TEXT         NOT NULL
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id         SERIAL       PRIMARY KEY,
      event_type VARCHAR(50)  NOT NULL,
      ip         VARCHAR(100) NOT NULL,
      details    JSONB        NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
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
      id           SERIAL       PRIMARY KEY,
      name         VARCHAR(30)  NOT NULL,
      score        INTEGER      NOT NULL DEFAULT 0,
      apples_eaten INTEGER      NOT NULL DEFAULT 0,
      date         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate existing nightmare_leaderboard table: add id column if missing
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nightmare_leaderboard' AND column_name = 'id'
      ) THEN
        ALTER TABLE nightmare_leaderboard ADD COLUMN id SERIAL;
      END IF;
    END $$
  `).catch(() => {});
  // Drop old primary key on name if still present, then add id as primary key
  await dbPool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'nightmare_leaderboard'::regclass AND contype = 'p'
          AND conname = 'nightmare_leaderboard_pkey'
          AND array_to_string(
            ARRAY(SELECT attname FROM pg_attribute
                  WHERE attrelid = 'nightmare_leaderboard'::regclass
                    AND attnum = ANY(conkey)),
            ',') = 'name'
      ) THEN
        ALTER TABLE nightmare_leaderboard DROP CONSTRAINT nightmare_leaderboard_pkey;
        ALTER TABLE nightmare_leaderboard ADD PRIMARY KEY (id);
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS nightmare_leaderboard_name_unique
      ON nightmare_leaderboard (name)
      WHERE name != 'Anonymous'
  `);
  // Migrate: add kills and time_played columns to nightmare_leaderboard if missing
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nightmare_leaderboard' AND column_name = 'kills'
      ) THEN
        ALTER TABLE nightmare_leaderboard ADD COLUMN kills INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nightmare_leaderboard' AND column_name = 'time_played'
      ) THEN
        ALTER TABLE nightmare_leaderboard ADD COLUMN time_played INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      message     TEXT         NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS feedback_user_info (
      id          UUID         PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
      details     JSONB        NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  // Always update the admin password hash to match the current ADMIN_PASSWORD env var.
  // Using DO UPDATE ensures a stale hash (e.g. from an old password) is replaced on startup.
  if (DEFAULT_ADMIN_HASH) {
    await dbPool.query(
      `INSERT INTO admin_settings (key, value)
       VALUES ('password_hash', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [DEFAULT_ADMIN_HASH]
    );
  }
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS user_accounts (
      username         VARCHAR(30)   PRIMARY KEY,
      password_hash    TEXT          NOT NULL,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      registration_ip  VARCHAR(100)  DEFAULT NULL
    )
  `);
  // Migrate: add registration_ip column to user_accounts if missing
  await dbPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_accounts' AND column_name = 'registration_ip'
      ) THEN
        ALTER TABLE user_accounts ADD COLUMN registration_ip VARCHAR(100) DEFAULT NULL;
      END IF;
    END $$
  `).catch(() => {});
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token         CHAR(64)      PRIMARY KEY,
      username      VARCHAR(30)   NOT NULL REFERENCES user_accounts(username) ON DELETE CASCADE,
      expires_at    TIMESTAMPTZ   NOT NULL
    )
  `);
  // Load persisted site state
  const siteStateRow = await dbPool.query(
    `SELECT value FROM admin_settings WHERE key = 'site_state' LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if (siteStateRow.rows.length) {
    try {
      const stored = JSON.parse(siteStateRow.rows[0].value);
      if (stored && typeof stored.down === 'boolean') {
        siteState = { down: stored.down, downSince: stored.downSince || null };
      }
    } catch (_) {}
  }
}

async function saveSiteState() {
  if (!dbPool) return;
  await dbPool.query(
    `INSERT INTO admin_settings (key, value)
     VALUES ('site_state', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(siteState)]
  ).catch(err => console.error('[SITE STATE] DB save error:', err.message));
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

// ── User account helpers ──────────────────────
function isValidUsername(name) {
  if (!name || name.length < 3 || name.length > 20) return false;
  if (name.toLowerCase() === 'anonymous') return false;
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return false;
  if (containsBannedWord(name)) return false;
  return true;
}

async function registerUser(username, password, registrationIp) {
  if (!dbPool) throw new Error('no_db');
  const hash = generatePasswordHash(password);
  await dbPool.query(
    `INSERT INTO user_accounts (username, password_hash, registration_ip) VALUES ($1, $2, $3)`,
    [username, hash, registrationIp || null]
  );
}

async function loginUser(username, password) {
  if (!dbPool) return null;
  const res = await dbPool.query(
    `SELECT username, password_hash FROM user_accounts WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (!verifyPassword(password, row.password_hash)) return null;
  return row.username; // return exact casing stored in DB
}

async function createUserSession(username) {
  if (!dbPool) return null;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS);
  await dbPool.query(
    `INSERT INTO user_sessions (token, username, expires_at) VALUES ($1, $2, $3)`,
    [token, username, expiresAt]
  );
  return token;
}

async function verifyUserSession(token) {
  if (!dbPool || !token) return null;
  const safeToken = String(token).slice(0, 64);
  const res = await dbPool.query(
    `SELECT username, expires_at FROM user_sessions WHERE token = $1 LIMIT 1`,
    [safeToken]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (Date.now() > new Date(row.expires_at).getTime()) {
    await dbPool.query(`DELETE FROM user_sessions WHERE token = $1`, [safeToken]);
    return null;
  }
  return row.username;
}

async function deleteUserSession(token) {
  if (!dbPool || !token) return;
  const safeToken = String(token).slice(0, 64);
  await dbPool.query(`DELETE FROM user_sessions WHERE token = $1`, [safeToken]);
}

async function checkLeaderboardRemoval(name) {
  if (!dbPool) return { removed: false, removedAt: null };
  const safeName = String(name).slice(0, 30);
  const res = await dbPool.query(
    `SELECT removed_at FROM leaderboard_removals WHERE name = $1 LIMIT 1`,
    [safeName]
  );
  if (res.rows.length === 0) return { removed: false, removedAt: null };
  return { removed: true, removedAt: res.rows[0].removed_at };
}

async function getLeaderboardFromDb() {
  if (!dbPool) return [];
  const res = await dbPool.query(
    `SELECT name, score, apples_eaten AS "applesEaten", kills, time_played AS "timePlayed", date
       FROM leaderboard
      ORDER BY score DESC
      LIMIT $1`,
    [MAX_LEADERBOARD_ENTRIES]
  );
  return res.rows;
}

async function addLeaderboardEntry(name, score, applesEaten, kills, timePlayed) {
  // Sanitize input — strip non-printable ASCII and HTML-injection characters
  let safeName = String(name || 'Anonymous').slice(0, 30).replace(/[^\x20-\x7E]/g, '').replace(/[<>&"']/g, '').trim() || 'Anonymous';
  // Replace banned names silently with Anonymous
  if (containsBannedWord(safeName)) safeName = 'Anonymous';
  const safeScore  = Math.max(0, Math.min(1e7, Math.floor(Number(score) || 0)));
  const safeApples = Math.max(0, Math.min(1e6, Math.floor(Number(applesEaten) || 0)));
  const safeKills  = Math.max(0, Math.min(1e6, Math.floor(Number(kills) || 0)));
  const safeTime   = Math.max(0, Math.min(86400, Math.floor(Number(timePlayed) || 0)));

  if (!dbPool) return;
  if (safeName === 'Anonymous') {
    await dbPool.query(
      `INSERT INTO leaderboard (name, score, apples_eaten, kills, time_played, date) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [safeName, safeScore, safeApples, safeKills, safeTime]
    );
  } else {
    await dbPool.query(
      `INSERT INTO leaderboard (name, score, apples_eaten, kills, time_played, date)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (name) WHERE name != 'Anonymous' DO UPDATE
         SET score        = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.score        ELSE leaderboard.score        END,
             apples_eaten = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.apples_eaten ELSE leaderboard.apples_eaten END,
             kills        = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.kills        ELSE leaderboard.kills        END,
             time_played  = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.time_played  ELSE leaderboard.time_played  END,
             date         = CASE WHEN EXCLUDED.score > leaderboard.score THEN NOW()                 ELSE leaderboard.date         END`,
      [safeName, safeScore, safeApples, safeKills, safeTime]
    );
  }
}

async function getNightmareLeaderboardFromDb() {
  if (!dbPool) return [];
  const res = await dbPool.query(
    `SELECT name, score, apples_eaten AS "applesEaten", kills, time_played AS "timePlayed", date
       FROM nightmare_leaderboard
      ORDER BY score DESC
      LIMIT $1`,
    [MAX_LEADERBOARD_ENTRIES]
  );
  return res.rows;
}

async function addNightmareLeaderboardEntry(name, score, applesEaten, kills, timePlayed) {
  // Sanitize input — strip non-printable ASCII and HTML-injection characters
  let safeName = String(name || 'Anonymous').slice(0, 30).replace(/[^\x20-\x7E]/g, '').replace(/[<>&"']/g, '').trim() || 'Anonymous';
  if (containsBannedWord(safeName)) safeName = 'Anonymous';
  const safeScore  = Math.max(0, Math.min(1e7, Math.floor(Number(score) || 0)));
  const safeApples = Math.max(0, Math.min(1e6, Math.floor(Number(applesEaten) || 0)));
  const safeKills  = Math.max(0, Math.min(1e6, Math.floor(Number(kills) || 0)));
  const safeTime   = Math.max(0, Math.min(86400, Math.floor(Number(timePlayed) || 0)));

  if (!dbPool) return;
  if (safeName === 'Anonymous') {
    await dbPool.query(
      `INSERT INTO nightmare_leaderboard (name, score, apples_eaten, kills, time_played, date) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [safeName, safeScore, safeApples, safeKills, safeTime]
    );
  } else {
    await dbPool.query(
      `INSERT INTO nightmare_leaderboard (name, score, apples_eaten, kills, time_played, date)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (name) WHERE name != 'Anonymous' DO UPDATE
         SET score        = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.score        ELSE nightmare_leaderboard.score        END,
             apples_eaten = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.apples_eaten ELSE nightmare_leaderboard.apples_eaten END,
             kills        = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.kills        ELSE nightmare_leaderboard.kills        END,
             time_played  = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN EXCLUDED.time_played  ELSE nightmare_leaderboard.time_played  END,
             date         = CASE WHEN EXCLUDED.score > nightmare_leaderboard.score THEN NOW()                 ELSE nightmare_leaderboard.date         END`,
      [safeName, safeScore, safeApples, safeKills, safeTime]
    );
  }
}

async function deleteNightmareLeaderboardEntry(name) {
  if (!dbPool) return;
  const safeName = String(name).slice(0, 30);
  await dbPool.query(`DELETE FROM nightmare_leaderboard WHERE name = $1`, [safeName]);
  await dbPool.query(
    `INSERT INTO leaderboard_removals (name, removed_at)
     VALUES ($1, NOW())
     ON CONFLICT (name) DO UPDATE SET removed_at = NOW()`,
    [safeName]
  );
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
  if (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const rawPath = (req.url || '/').split('?')[0];
  let urlPath;
  try { urlPath = decodeURIComponent(rawPath); } catch { res.writeHead(400); res.end('Bad Request'); return; }

  // ── Site state (public) ───────────────────────
  if (urlPath === '/api/site-state') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ down: siteState.down, downSince: siteState.downSince }));
    return;
  }

  // ── Admin: set site state ─────────────────────
  if (urlPath === '/api/admin/site-state') {
    const adminCorsH = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCorsH); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, down } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCorsH });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        const goingDown = !!down;
        if (goingDown && !siteState.down) {
          siteState = { down: true, downSince: new Date().toISOString() };
          // Broadcast to all connected WebSocket clients so playing users get warned
          const broadcastMsg = JSON.stringify({ type: 'site_going_down', downSince: siteState.downSince });
          for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(broadcastMsg);
          }
        } else if (!goingDown) {
          siteState = { down: false, downSince: null };
        }
        saveSiteState();
        res.writeHead(200, { 'Content-Type': 'application/json', ...adminCorsH });
        res.end(JSON.stringify({ ok: true, down: siteState.down, downSince: siteState.downSince }));
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

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
    checkLeaderboardRemoval(name).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ removed: result.removed, removedAt: result.removedAt }));
    }).catch(err => {
      console.error('Check removal error:', err.message);
      res.writeHead(500); res.end('Internal Server Error');
    });
    return;
  }

  // ── Leaderboard: check if name is already taken ──
  if (urlPath === '/api/leaderboard/check-name') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    const qs = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(qs);
    const name = String(params.get('name') || '').slice(0, 30).trim();
    if (!name || name.toLowerCase() === 'anonymous') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ taken: false }));
      return;
    }
    if (!dbPool) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ taken: false }));
      return;
    }
    dbPool.query(
      `SELECT 1 FROM leaderboard WHERE LOWER(name) = LOWER($1) AND name != 'Anonymous' LIMIT 1`,
      [name]
    ).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ taken: result.rows.length > 0 }));
    }).catch(err => {
      console.error('Check name error:', err.message);
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
          // Require a server-tracked session — reject any submission without one.
          // This prevents score tampering by omitting sessionId to fall back to
          // client-supplied score values.
          if (!d.sessionId) {
            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: 'Session required' }));
            return;
          }
          const safeId = String(d.sessionId).replace(/[^0-9a-f]/gi, '').slice(0, 16);
          const sess = spSessions.get(safeId);
          if (!sess) {
            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: 'Invalid or expired session' }));
            return;
          }
          // Use only server-tracked values — never trust client-supplied stats
          const score       = sess.score;
          const applesEaten = sess.applesEaten;
          const kills       = sess.kills;
          const timePlayed  = Math.floor((Date.now() - sess.startTime) / 1000);
          // Consume the session so it cannot be reused
          clearTimeout(sess.cleanupTimer);
          spSessions.delete(safeId);
          // Verify auth token — only account holders may use a non-Anonymous name
          const tokenStr = d.token ? String(d.token).slice(0, 64) : null;
          verifyUserSession(tokenStr).then(verifiedUsername => {
            const name = verifiedUsername || 'Anonymous';
            addLeaderboardEntry(name, score, applesEaten, kills, timePlayed).then(() => {
              res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
              res.end(JSON.stringify({ ok: true }));
            }).catch(err => {
              console.error('Leaderboard POST error:', err.message);
              res.writeHead(500); res.end('Internal Server Error');
            });
          }).catch(err => {
            console.error('Leaderboard token verify error:', err.message);
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
          // Require a server-tracked session — reject any submission without one.
          if (!d.sessionId) {
            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: 'Session required' }));
            return;
          }
          const safeId = String(d.sessionId).replace(/[^0-9a-f]/gi, '').slice(0, 16);
          const sess = spSessions.get(safeId);
          if (!sess) {
            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: 'Invalid or expired session' }));
            return;
          }
          // Use only server-tracked values — never trust client-supplied stats
          const score       = sess.score;
          const applesEaten = sess.applesEaten;
          const kills       = sess.kills;
          const timePlayed  = Math.floor((Date.now() - sess.startTime) / 1000);
          // Consume the session so it cannot be reused
          clearTimeout(sess.cleanupTimer);
          spSessions.delete(safeId);
          // Verify auth token — only account holders may use a non-Anonymous name
          const tokenStr = d.token ? String(d.token).slice(0, 64) : null;
          verifyUserSession(tokenStr).then(verifiedUsername => {
            const name = verifiedUsername || 'Anonymous';
            addNightmareLeaderboardEntry(name, score, applesEaten, kills, timePlayed).then(() => {
              res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
              res.end(JSON.stringify({ ok: true }));
            }).catch(err => {
              console.error('Nightmare leaderboard POST error:', err.message);
              res.writeHead(500); res.end('Internal Server Error');
            });
          }).catch(err => {
            console.error('Nightmare leaderboard token verify error:', err.message);
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
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      logAdminEvent('login_rate_limited', ip, collectRequestFingerprint(req, { retryAfterSec: rateCheck.retryAfterSec }));
      res.writeHead(429, { 'Content-Type': 'application/json', ...adminCors, 'Retry-After': String(rateCheck.retryAfterSec) });
      res.end(JSON.stringify({ ok: false, message: 'Too many attempts. Try again later.' }));
      return;
    }
    const baseFingerprint = collectRequestFingerprint(req, {});
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 512) req.destroy(); });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        const pw = String(password || '');
        const loginDetails = { ...baseFingerprint, passwordLength: pw.length };
        getAdminPasswordHash().then(storedHash => {
          const hashToCheck = storedHash || DEFAULT_ADMIN_HASH;
          if (isLegacyPasswordMatch(pw, hashToCheck)) {
            logAdminEvent('login_failed_legacy_password', ip, loginDetails);
            recordFailedLogin(ip);
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          if (!verifyPassword(pw, hashToCheck)) {
            logAdminEvent('login_failed', ip, loginDetails);
            recordFailedLogin(ip);
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          clearLoginAttempts(ip);
          const token = generateToken();
          adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
          logAdminEvent('login_success', ip, loginDetails);
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true, token }));
        }).catch(err => {
          console.error('Admin login DB error:', err.message);
          // DB unavailable — fall back to in-memory default hash
          if (isLegacyPasswordMatch(pw, DEFAULT_ADMIN_HASH)) {
            logAdminEvent('login_failed_legacy_password', ip, { ...loginDetails, dbFallback: true });
            recordFailedLogin(ip);
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          if (!verifyPassword(pw, DEFAULT_ADMIN_HASH)) {
            logAdminEvent('login_failed', ip, { ...loginDetails, dbFallback: true });
            recordFailedLogin(ip);
            res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          clearLoginAttempts(ip);
          const token = generateToken();
          adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
          logAdminEvent('login_success', ip, { ...loginDetails, dbFallback: true });
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
          } else if (!sess.pendingScore) {
            // Only prune sessions that aren't waiting for a score submission
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

  // ── Admin: audit logs ────────────────────────
  if (urlPath === '/api/admin/logs') {
    if (req.method === 'OPTIONS') { res.writeHead(204, adminCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token, limit = 100 } = JSON.parse(body);
        if (!isValidAdminToken(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
          return;
        }
        if (!dbPool) {
          res.writeHead(503, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: false, message: 'Database unavailable' }));
          return;
        }
        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
        dbPool.query(
          `SELECT id, event_type, ip, details, created_at FROM admin_logs ORDER BY created_at DESC LIMIT $1`,
          [safeLimit]
        ).then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...adminCors });
          res.end(JSON.stringify({ ok: true, logs: result.rows }));
        }).catch(err => {
          console.error('Admin logs fetch error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // ── User Account API ─────────────────────────
  const authCors = {
    'Access-Control-Allow-Origin': 'https://doxnaf.online',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (urlPath === '/api/auth/register') {
    if (req.method === 'OPTIONS') { res.writeHead(204, authCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', ...authCors, 'Retry-After': String(rateCheck.retryAfterSec) });
      res.end(JSON.stringify({ ok: false, message: 'Too many attempts. Try again later.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        const uname = String(username || '').trim();
        const pw    = String(password || '');
        if (!isValidUsername(uname)) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: false, message: 'Invalid username. Use 3–20 characters: letters, numbers, spaces, _ or -.' }));
          return;
        }
        if (pw.length < 6 || pw.length > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: false, message: 'Password must be 6–100 characters.' }));
          return;
        }
        if (!dbPool) {
          res.writeHead(503, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: false, message: 'Service unavailable — try again later.' }));
          return;
        }
        registerUser(uname, pw, ip).then(() => {
          console.log(`[REGISTER] New account created: username="${uname}" ip="${ip}"`);
          clearLoginAttempts(ip);
          return createUserSession(uname).then(token => {
            res.writeHead(200, { 'Content-Type': 'application/json', ...authCors });
            res.end(JSON.stringify({ ok: true, token, username: uname }));
          });
        }).catch(err => {
          if (err.code === '23505') { // unique_violation
            recordFailedLogin(ip);
            res.writeHead(409, { 'Content-Type': 'application/json', ...authCors });
            res.end(JSON.stringify({ ok: false, message: 'Username already taken.' }));
          } else {
            console.error('Register error:', err.message);
            res.writeHead(500); res.end('Internal Server Error');
          }
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/auth/login') {
    if (req.method === 'OPTIONS') { res.writeHead(204, authCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', ...authCors, 'Retry-After': String(rateCheck.retryAfterSec) });
      res.end(JSON.stringify({ ok: false, message: 'Too many attempts. Try again later.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        const uname = String(username || '').trim();
        const pw    = String(password || '');
        if (!dbPool) {
          res.writeHead(503, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: false, message: 'Service unavailable — try again later.' }));
          return;
        }
        loginUser(uname, pw).then(canonical => {
          if (!canonical) {
            recordFailedLogin(ip);
            res.writeHead(401, { 'Content-Type': 'application/json', ...authCors });
            res.end(JSON.stringify({ ok: false, message: 'Incorrect username or password.' }));
            return;
          }
          clearLoginAttempts(ip);
          return createUserSession(canonical).then(token => {
            res.writeHead(200, { 'Content-Type': 'application/json', ...authCors });
            res.end(JSON.stringify({ ok: true, token, username: canonical }));
          });
        }).catch(err => {
          console.error('Login error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/auth/verify') {
    if (req.method === 'OPTIONS') { res.writeHead(204, authCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        verifyUserSession(token).then(username => {
          if (!username) {
            res.writeHead(401, { 'Content-Type': 'application/json', ...authCors });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: true, username }));
        }).catch(err => {
          console.error('Verify error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  if (urlPath === '/api/auth/logout') {
    if (req.method === 'OPTIONS') { res.writeHead(204, authCors); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 256) req.destroy(); });
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        deleteUserSession(token).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: true }));
        }).catch(() => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...authCors });
          res.end(JSON.stringify({ ok: true }));
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // ── Feedback API ──────────────────────────────
  if (urlPath === '/api/feedback') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://doxnaf.online',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    const fingerprint = collectRequestFingerprint(req, {});
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const message = String(d.message || '').slice(0, 2000).trim();
        if (!message) { res.writeHead(400); res.end('Bad Request'); return; }
        if (!dbPool) {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        dbPool.query(
          `INSERT INTO feedback (message) VALUES ($1) RETURNING id`,
          [message]
        ).then(result => {
          const feedbackId = result.rows[0].id;
          return dbPool.query(
            `INSERT INTO feedback_user_info (id, details) VALUES ($1, $2)`,
            [feedbackId, JSON.stringify(fingerprint)]
          ).then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: true }));
          });
        }).catch(err => {
          console.error('Feedback POST error:', err.message);
          res.writeHead(500); res.end('Internal Server Error');
        });
      } catch (_) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // Serve PixiJS from node_modules (no CDN dependency)
  if (urlPath === '/pixi.min.js') {
    const pixiPath = path.resolve(__dirname, 'node_modules/pixi.js/dist/pixi.min.js');
    fs.readFile(pixiPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  // Serve @pixi/unsafe-eval for CSP-compliant WebGL shader compilation
  if (urlPath === '/pixi-unsafe-eval.min.js') {
    const unsafeEvalPath = path.resolve(__dirname, 'node_modules/@pixi/unsafe-eval/dist/unsafe-eval.min.js');
    fs.readFile(unsafeEvalPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(data);
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
    const headers = { 'Content-Type': mime };
    if (mime.startsWith('text/html')) {
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['Content-Security-Policy'] =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' wss: https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

const rooms = new Map(); // code → room

// ── Singleplayer session tracking ─────────────
const spSessions = new Map(); // sessionId → { ws, playerName, startTime, lastSnapshot, score, applesEaten, pendingScore, cleanupTimer }
// How long (ms) to keep a closed session available for score submission
const SP_SCORE_SUBMISSION_TTL_MS = 120000;
const SP_VALID_COMMANDS = new Set(['sp_spawn_enemy', 'sp_spawn_apple', 'sp_spawn_chest', 'sp_toggle_nightmare']);
// Anti-cheat: cheapest enemy awards 5 pts per kill — used to cap kill count proportional to score
const MIN_PTS_PER_KILL = 5;
const KILL_RATE_BUFFER = 50; // extra kills tolerated above the score-derived maximum

function createSpSession(ws, playerName) {
  const sessionId = crypto.randomBytes(8).toString('hex');
  spSessions.set(sessionId, {
    ws,
    playerName,
    startTime:    Date.now(),
    lastSnapshot: null,
    score:        0,
    applesEaten:  0,
    kills:        0,
    pendingScore: false,
    cleanupTimer: null,
  });
  ws._spSessionId = sessionId;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'sp_registered', sessionId }));
  }
}

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
        if (playerRoom || ws._spSessionId || ws._spRegistrationInProgress) return; // already in use
        ws._spRegistrationInProgress = true; // prevent re-entry while token verification is in flight
        const tokenStr = msg.token ? String(msg.token).slice(0, 64) : null;
        verifyUserSession(tokenStr).then(verifiedUsername => {
          // Only account holders may use their real name; everyone else is Anonymous
          createSpSession(ws, verifiedUsername || 'Anonymous');
        }).catch(() => {
          createSpSession(ws, 'Anonymous');
        }).finally(() => {
          ws._spRegistrationInProgress = false;
        });
        break;
      }

      case 'sp_score_event': {
        // Client reports a score increment — accumulate server-side for anti-cheat
        if (!ws._spSessionId) return;
        const sess = spSessions.get(ws._spSessionId);
        if (!sess) return;
        const scoreDelta  = Math.max(0, Math.floor(Number(msg.score)  || 0));
        const applesDelta = Math.max(0, Math.floor(Number(msg.apples) || 0));
        const killsDelta  = Math.max(0, Math.floor(Number(msg.kills)  || 0));
        // Rate-limit: total session score may not exceed 2000 pts/s elapsed + 10 000 buffer
        const maxAllowed = 2000 * Math.ceil((Date.now() - sess.startTime) / 1000) + 10000;
        if (sess.score + scoreDelta <= maxAllowed) {
          sess.score       += scoreDelta;
          sess.applesEaten += applesDelta;
          // Kills are also rate-limited: minimum 5 pts per kill (cheapest enemy)
          // means kills cannot legitimately exceed score/5 plus a small buffer
          const maxKills = Math.ceil(sess.score / MIN_PTS_PER_KILL) + KILL_RATE_BUFFER;
          if (sess.kills + killsDelta <= maxKills) {
            sess.kills += killsDelta;
          }
        }
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
    // Keep singleplayer session alive briefly so the score POST can still use it
    if (ws._spSessionId) {
      const sess = spSessions.get(ws._spSessionId);
      if (sess) {
        sess.pendingScore = true;
        sess.cleanupTimer = setTimeout(() => {
          spSessions.delete(ws._spSessionId);
        }, SP_SCORE_SUBMISSION_TTL_MS);
      }
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
