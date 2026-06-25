# SMASH ARENA

A browser-based **Super Smash Bros–style platform fighter** for the classroom.
Four fighters, full movesets (jabs, tilts, smash attacks, aerials, specials,
grabs), percent-based knockback, ledges, shields, and dodges. Plays on
**keyboard + mouse** or **gamepad**, locally (same screen) or **online over a
LAN** so everyone can play from their own computer.

No build step, no framework, no asset downloads — vanilla ES modules + Canvas2D
and a custom fixed-timestep physics/knockback engine.

---

## Run it locally (no install)

The game itself needs **zero dependencies** — just serve the folder over HTTP
(ES modules and the Gamepad API don't work from `file://`).

From the project folder:

```bash
# Python 3 (already on macOS)
python3 -m http.server 5173
```

Then open **http://localhost:5173** and hit **PLAY LOCAL**.

Any static server works just as well, e.g.:

```bash
npx serve .          # Node
php -S localhost:5173
```

### Controls

| Action  | Keyboard            | Gamepad        |
| ------- | ------------------- | -------------- |
| Move    | `A` / `D` (or ←/→)  | Left stick     |
| Jump    | `W` / `Space`       | `A`            |
| Attack  | `J`                 | `X`            |
| Special | `K`                 | `Y`            |
| Shield  | `L` / `Shift`       | `RB` / triggers|
| Grab    | `U`                 | `LB`           |

- **Tilt vs Smash:** hold a direction + Attack = a tilt; *flick* the
  stick / fresh-tap a direction then Attack within a few frames = a **smash**
  (hold Attack to charge it).
- **Aerials:** Attack in the air — neutral / forward / back / up / down.
- **Recover:** jump back and use **Up + Special**; grab the ledge to hang.
- **Shield:** hold Shield; add a direction to **roll**, down to **spot-dodge**,
  or **grab** to beat a shielding opponent.

Local play supports **2–4 players** on one machine — P1 on keyboard, others on
gamepads, or fill empty slots with **CPU**.

---

## Play online over the LAN (optional)

So students on different computers share one match. This is the only part that
needs an install (one small package, `ws`).

1. On the host machine:

   ```bash
   cd server
   npm install        # installs `ws`
   npm start          # listens on ws://localhost:8080
   ```

   The console prints your LAN address (e.g. `ws://192.168.1.42:8080`).

2. Everyone opens the game (served as above) → **PLAY ONLINE**, enters the host's
   `ws://…:8080` address, picks a fighter, and connects.

3. When 2+ players are in, anyone presses **START MATCH**.

The server is authoritative: it runs the real simulation and broadcasts state to
every client ~60×/sec. On a LAN the latency is negligible.

---

## Roster

| Fighter   | Archetype     | Identity                                            |
| --------- | ------------- | --------------------------------------------------- |
| **VOLT**  | All-Rounder   | Even stats, a plasma bolt projectile, reliable kills|
| **BLAZE** | Speedster     | Blazing speed and combos, but light — dies early    |
| **TITAN** | Heavyweight   | Huge damage, survives forever, slow startup         |
| **SPRITE**| Aerialist     | Five jumps, floaty edgeguards, fragile up close     |

---

## Project structure

```
smash-arena/
├── index.html              # screens: title / setup / game / results / online
├── styles/main.css         # neon-arcade chrome
├── src/
│   ├── main.js             # entry: loops, wiring
│   ├── engine/             # math, input (keyboard+gamepad), audio
│   ├── game/               # constants, knockback, hitbox, fighter, match, stage, ai
│   ├── data/characters.js  # the roster as data (movesets = hitbox tables)
│   ├── render/             # renderer, hud, effects
│   ├── ui/screens.js       # menu + character-select controller
│   └── net/                # snapshot codec + WebSocket client
└── server/                 # authoritative LAN room server (Node + ws)
```

The simulation in `src/game/` is **pure and deterministic** — the same module
runs in the browser for local play and inside the Node server for online play.

---

## Notes & roadmap

- Knockback uses the SmashWiki formula (base knockback + growth + weight +
  percent), with hitstun, directional influence (±18°), hitlag, and charged
  smashes.
- Online is an authoritative-server MVP tuned for LAN. A rollback/prediction
  layer could be added later; the deterministic sim already supports it.
- Everything is synthesized at runtime (vector fighters, WebAudio SFX) so the
  whole game is a tiny static download.
# supersmashbrosgameforschoollmao
