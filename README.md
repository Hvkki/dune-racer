# 🏜️ Dune Racer

A desert-themed arcade racing game built with [Three.js](https://threejs.org/) — drift across procedurally generated dunes, chain nitro boosts, and chase your best lap time. Original, Asphalt-inspired arcade handling with zero build step: it's just HTML + ES modules.

![Three.js](https://img.shields.io/badge/Three.js-0.160.0-000000?logo=three.js) ![No Build Step](https://img.shields.io/badge/build-none-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- **Arcade physics** — forgiving, drifty handling with speed-sensitive steering. Not a sim; built for fun.
- **Nitro boost** — a depleting/recharging meter that punches up top speed and acceleration, with an FOV kick and screen shake for juice.
- **Drifting** — hold **Shift** (or steer hard at speed) to break traction and throw up dust.
- **Procedural desert** — noise-displaced sand dunes, a gradient sky, warm sunlight, and scattered low-poly rocks & cacti. No asset downloads.
- **Race track & laps** — a looped course with sequential checkpoints, lap counter, live lap timer, and best-lap tracking.
- **Chase camera** — smooth trailing follow-cam with look-ahead and speed-based FOV.
- **Dust particles** — a recycled point-sprite system that kicks up sand when you drift or boost.
- **Procedural audio** — engine + boost sound synthesized live with the Web Audio API (no sound files).
- **Bloom post-processing** — subtle glow on nitro flames and highlights.

## 🎮 Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Nitro boost |
| `Shift` | Drift |
| `R` | Reset car to start |

## 🚀 Running it

The game uses ES modules and an import map, so it must be served over HTTP (not opened as a `file://`). Any static server works:

```bash
# Python (no install needed)
cd dune-racer
python3 -m http.server 8080
# then open http://localhost:8080

# or with npm
npm run serve
```

Three.js is loaded from a CDN via the import map in `index.html`, so no `npm install` is required just to play.

## 🧩 Project structure

```
dune-racer/
├── index.html          # entry point, import map, HUD + menu markup
├── styles.css          # HUD / menu styling
├── src/
│   ├── main.js         # game orchestrator + fixed-timestep loop
│   ├── config.js       # all tuning constants (physics, camera, race)
│   ├── input.js        # keyboard input
│   ├── car.js          # car mesh + arcade physics
│   ├── camera.js       # chase camera (FOV kick, shake)
│   ├── environment.js  # terrain, sky, lighting, props
│   ├── track.js        # curve, road mesh, checkpoints, lap logic
│   ├── particles.js    # dust trail
│   ├── hud.js          # HUD updates
│   └── audio.js        # procedural engine/boost audio
└── smoke-test.mjs      # headless Puppeteer smoke test
```

## 🔧 Tuning the feel

All the knobs live in [`src/config.js`](src/config.js). A few favorites:

- `GRIP` — lower = slidier (drift machine), higher = go-kart grip.
- `STEER_SPEEDFALLOFF` — lower = twitchy at speed, higher = stable.
- `TOP_SPEED`, `BOOST_TOP_MULT`, `BOOST_ACC_MULT` — raw speed and how much nitro adds.
- `CAM_DAMP` — camera follow lag (lower = more cinematic trailing).

## ✅ Testing

A headless smoke test (Puppeteer) serves the game, starts a race, simulates driving with nitro, and asserts the car moves, steering works, the nitro drains, the HUD updates, and no console/page errors occur:

```bash
npm install      # installs puppeteer (dev-only; not needed to play)
npm test
```

## 📜 License

MIT — see below. This is an original game inspired by the arcade racing genre. It is not affiliated with, endorsed by, or derived from any commercial racing franchise; all code and assets are original and generated procedurally.

---

Built for fun. Go chase that dune. 🌵
