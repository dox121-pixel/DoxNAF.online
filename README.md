# VIPER.exe

A browser-based roguelike snake game with smooth controls, a pistol system, enemy AI, and online multiplayer.

🌐 **Play it live at [doxnaf.online](https://doxnaf.online)**

## How to Play

- **Steer**: Move your mouse (desktop) or use the left on-screen joystick (mobile)
- **Shoot**: Aim with the right joystick (mobile) or right-click / hold (desktop)
- **Goal**: Eat apples to grow your snake and rack up score
- **Upgrades**: Every apple or two you earn a power-up – choose wisely
- **Survive**: Dodge enemies that spawn as your score climbs

## Game Modes

| Mode | Description |
|------|-------------|
| **Solo** | Classic roguelike run. Earn upgrades, fight escalating enemies. |
| **Nightmare** | Unlock after surviving 90 seconds. Much faster enemies, no upgrades, and a jumpscare on death. |
| **Online** | 1v1 multiplayer. Race a friend to collect apples. No enemies – pure competition. |

## Features

- **Phase through walls** – all modes wrap the arena edges; no wall deaths
- **Smooth snake movement** – analog mouse/joystick steering with fluid body physics
- **Enemy AI** – Chasers, Patrollers, Interceptors, and Blockers; all modes feature faster enemies with Nightmare being the most intense
- **Pistol system** – aim and shoot bullets to destroy enemies; fully controllable on mobile via a dedicated gun joystick
- **14 upgrades** – 5 one-time perks (PHASE WALK, BEHEMOTH, ORACLE, PIERCING, EXPLOSIVE) and 9 stackable upgrades (OVERDRIVE, SLOW TIME, WARD, ICEFIELD, REPULSE, PULSE, LIFESTEAL, RAPID FIRE, MULTISHOT)
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
