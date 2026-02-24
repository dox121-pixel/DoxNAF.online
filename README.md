# VIPER.exe

A browser-based roguelike snake game with smooth analog controls, a pistol system, escalating enemy AI, rare treasure chests, and online multiplayer.

🌐 **Play it live at [doxnaf.online](https://doxnaf.online)**

## How to Play

- **Steer**: Move your mouse (desktop) or use the left on-screen joystick (mobile)
- **Shoot**: Hold left-click / mouse button (desktop) or use the right gun joystick (mobile)
- **Goal**: Kill enemies to drop apples, eat apples to grow and earn upgrades
- **Upgrades**: Every apple or two you earn a power-up — choose wisely
- **Chests**: Rare treasure chests spawn over time — grab them for powerful one-time buffs
- **Survive**: Enemies grow in number and speed as your run progresses

## Game Modes

| Mode | Description |
|------|-------------|
| **Solo** | Classic roguelike run. Kill enemies for apples, earn upgrades, fight escalating threats. |
| **Nightmare** | Unlock after surviving 90 seconds. Much faster enemies, no upgrades, and a jumpscare on death. |
| **Online** | 1v1 multiplayer. Race a friend to collect apples. No enemies — pure competition. |

## Enemies

All enemies scale in speed over time. Nightmare mode spawns roughly 3× more enemies.

| Enemy | Unlocks | Behaviour |
|-------|---------|-----------|
| **Chaser** | Start | Directly chases the snake head |
| **Patroller** | 60 s | Patrols randomly, periodically charges at the player |
| **Speeder** | 90 s | Fast, erratic zigzag movement |
| **Phantom** | 120 s | Phases through the snake body — cannot be body-blocked; still kills on head contact |
| **Titan** | 180 s | Slow but massive; high HP tank enemy |

> **Note:** Enemies cannot spawn inside or on top of the snake body, even if the player is using Phase Walk.

## Apple System

- **Apples only drop from killed enemies.** There is no automatic apple respawning.
- Two starting apples are placed at game start to let you earn your first upgrades.
- Enemy-dropped apples are golden; they count toward upgrades when eaten.
- Eat apples to grow your snake and trigger the upgrade panel.

## Rare Chests

Treasure chests spawn on the map roughly every 45–60 seconds (first one at 30 s). Up to 3 chests can be present at once. Chests expire after 90 seconds if not collected. Walk over a chest to claim its item automatically.

| Rarity | Color | Example Items |
|--------|-------|---------------|
| **Common** | ⬜ Gray | BATTLE HARDENED (+2 shields), QUICK DRAW (fire 40% faster) |
| **Uncommon** | 🟩 Green | DOUBLE TAP (+2 multishot + fire boost), WAR CRY (big speed boost) |
| **Rare** | 🟦 Blue | SHARPSHOOTER (pierce + +4 damage), IRONCLAD (+5 shields + triple growth) |
| **Epic** | 🟪 Purple | OMEGA PULSE (PULSE ×5), SHADOW WALK (phase walk + scatter all enemies) |
| **Legendary** | 🟨 Gold | ANNIHILATE (kill ALL enemies instantly), DECIMATOR (explosive + pierce + +8 dmg + 5 multishot) |

## Upgrades (Normal Perks)

Earned by eating apples. Choose from 3 options (4 with ORACLE perk).

### One-Time Perks
| Perk | Effect |
|------|--------|
| 👻 PHASE WALK | Phase through yourself and walls |
| 🐉 BEHEMOTH | Triple growth per apple |
| 🔮 ORACLE | Choose from 4 upgrades instead of 3 |
| 🏹 PIERCING | Bullets pass through all enemies |
| 💣 EXPLOSIVE | Bullets explode on impact |

### Stackable Upgrades
| Upgrade | Effect |
|---------|--------|
| ⚡ OVERDRIVE | Move faster (stacks) |
| 🕰️ SLOW TIME | Move slower for more reaction time |
| 🛡️ WARD | Survive one fatal hit (up to ×5) |
| ❄️ ICEFIELD | Slow all enemies (stacks) |
| 💥 REPULSE | Scatter enemies on spawn |
| 💫 PULSE | Blast nearby enemies on apple pickup |
| 🔥 POWER SHOT | +1 bullet damage per stack |
| 🔫 RAPID FIRE | Shoot faster (stacks) |
| ✳️ MULTISHOT | Extra bullet per shot (stacks) |
| 🧲 MAGNETISM | Wider apple pickup radius (stacks) |

## Features

- **Phase through walls** – arena edges wrap; no wall deaths
- **Smooth snake movement** – analog mouse/joystick steering with fluid body physics
- **Enemy AI** – Chasers, Patrollers, Speeders, Phantoms, and Titans; escalating difficulty
- **Phantom ghost enemy** – phases through the snake body, spawns at the 2-minute mark
- **No free apple respawn** – apples only appear from killed enemies, rewarding aggression
- **Rare chest system** – 5 rarity tiers (Common → Legendary) with 10 unique powerful items
- **Pistol system** – aim and shoot bullets; fully controllable on mobile via a dedicated gun joystick
- **15 upgrades** – 5 one-time perks and 10 stackable upgrades
- **Online multiplayer** – real-time WebSocket 1v1 with teleport perks and room codes

## Running Locally

```bash
npm install
npm start
```

Then open **http://localhost:3001** in two browser windows to test multiplayer.

## Tech

- Vanilla JavaScript canvas game (no frameworks)
- Node.js + WebSocket server for online mode
- Hosted on [Render](https://render.com)
