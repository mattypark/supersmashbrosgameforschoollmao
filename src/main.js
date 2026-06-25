// SMASH ARENA — entry point. Wires input, audio, UI, the renderer, and either
// the local fixed-timestep sim or the online snapshot stream.

import { InputManager } from './engine/input.js';
import { SoundEngine } from './engine/audio.js';
import { DT } from './game/constants.js';
import { createMatch, stepMatch } from './game/match.js';
import { computeCpuInput } from './game/ai.js';
import { Effects } from './render/effects.js';
import { drawWorld } from './render/renderer.js';
import { drawHud, drawBanner } from './render/hud.js';
import { UI } from './ui/screens.js';
import { NetClient } from './net/client.js';
import { deserializeMatch } from './net/snapshot.js';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
const INTRO_FRAMES = 168;
const OUTRO_FRAMES = 110;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const input = new InputManager();
const sound = new SoundEngine();
const effects = new Effects();

// Load any saved custom key layout.
const CONTROLS_KEY = 'smasharena.controls';
let savedLayout = {};
try {
  savedLayout = JSON.parse(localStorage.getItem(CONTROLS_KEY) || '{}');
} catch {
  savedLayout = {};
}
input.setLayout(savedLayout);

const game = {
  mode: 'menu', // 'local' | 'online'
  match: null,
  view: null, // online: latest deserialized snapshot
  config: null,
  intro: 0,
  outro: 0,
  done: false,
  net: null,
  myIndex: -1,
  acc: 0,
  last: 0,
};

const ui = new UI({
  onStart: (config) => startLocal(config),
  onRematch: () => game.config && startLocal(game.config),
  onSound: (n) => sound.play(n),
  onOnlineJoin: (info) => joinOnline(info),
  layout: savedLayout,
  onControlsChange: (layout) => {
    input.setLayout(layout);
    try {
      localStorage.setItem(CONTROLS_KEY, JSON.stringify(layout));
    } catch {
      /* storage unavailable — keep in-memory only */
    }
  },
});

// Resume audio on first interaction (autoplay policy).
const armAudio = () => {
  sound.resume();
  window.removeEventListener('pointerdown', armAudio);
  window.removeEventListener('keydown', armAudio);
};
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

// Default the online address to wherever this page is served from, so a deployed
// build is zero-config. Static-only dev (port 5173) points at the local server.
(() => {
  const field = document.getElementById('server-url');
  if (!field) return;
  if (location.protocol === 'file:' || location.port === '5173') {
    field.value = 'ws://localhost:8080';
  } else if (location.host) {
    field.value = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  }
})();

// Quit buttons.
document.querySelectorAll('[data-action="quit"]').forEach((b) =>
  b.addEventListener('click', () => {
    teardownNet();
    game.mode = 'menu';
    ui.show('title');
  }),
);

// ---------------- LOCAL ----------------

function startLocal(config) {
  game.mode = 'local';
  game.config = config;
  game.match = createMatch(config);
  game.match.onSfx = (name) => sound.play(name);
  // bind devices: fighter index -> input device (null for CPU)
  const bindings = config.players.map((p) => (p.type === 'human' ? p.binding : null));
  input.setBindings(bindings);
  effects.particles.length = 0;
  effects.flashes.length = 0;
  game.intro = INTRO_FRAMES;
  game.outro = 0;
  game.done = false;
  ui.show('game');
}

function gatherLocalInputs() {
  const m = game.match;
  return m.fighters.map((f, i) => {
    const p = game.config.players[i];
    if (p && p.type === 'cpu') return computeCpuInput(f, m);
    return input.getState(i);
  });
}

function stepLocal() {
  if (game.intro > 0) {
    game.intro--;
    return;
  }
  const inputs = gatherLocalInputs();
  stepMatch(game.match, inputs);
  effects.ingest(game.match.events);

  if (game.match.over && !game.done) {
    game.done = true;
    game.outro = OUTRO_FRAMES;
  }
  if (game.done && game.outro > 0) {
    game.outro--;
    if (game.outro === 0) ui.showResults(game.match.winner);
  }
}

// ---------------- ONLINE ----------------

function joinOnline(info) {
  teardownNet();
  ui.log(`Connecting to ${info.url} ...`);
  // pick a device: gamepad if present, else keyboard
  const pads = InputManager.connectedPads();
  input.setBindings([pads.length ? { type: 'gamepad', index: pads[0].index } : { type: 'keyboard' }]);

  game.net = new NetClient(info.url, {
    onOpen: () => {
      ui.log('Connected. Waiting in lobby — press CONNECT again to START when 2+ players are in.');
      game.net.join(info.name, info.charId, info.skin);
    },
    onLog: (m) => ui.log(m),
    onWelcome: (m) => {
      game.myIndex = m.index;
      ui.log(`You are player slot ${m.index + 1}.`);
      // turn the join button into a START control
      const btn = document.getElementById('join-btn');
      btn.textContent = 'START MATCH ▸';
      btn.onclick = () => game.net.start();
    },
    onLobby: (m) => ui.log(`Lobby: ${m.count} player(s) connected.`),
    onStart: (m) => {
      if (m.index != null) game.myIndex = m.index;
      game.mode = 'online';
      game.view = null;
      game.done = false;
      game.intro = 0;
      effects.particles.length = 0;
      ui.show('game');
    },
    onState: (snap) => {
      game.view = deserializeMatch(snap);
      effects.ingest(game.view.events);
      for (const ev of game.view.events) {
        if (ev.type === 'spark') sound.play(ev.power > 80 ? 'hitBig' : 'hit');
        else if (ev.type === 'blast') sound.play('ko');
      }
    },
    onOver: (m) => {
      const winner = game.view && m.winner != null ? game.view.fighters[m.winner] : null;
      ui.showResults(winner);
      game.mode = 'menu';
    },
  });
  game.net.connect();
}

function sendOnlineInput() {
  if (!game.net || !game.net.connected) return;
  game.net.sendInput(input.getState(0));
}

function teardownNet() {
  if (game.net) {
    game.net.close();
    game.net = null;
  }
}

// ---------------- RENDER ----------------

function render(view) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (view) {
    drawWorld(ctx, view, effects);
    effects.update();
    effects.drawScreenFlash(ctx, canvas.width, canvas.height);
    drawHud(ctx, view);
  }
  // countdown / GO banner (local)
  if (game.mode === 'local' && game.match) {
    if (game.intro > 0) {
      const n = Math.ceil(game.intro / 56);
      const label = n >= 3 ? '3' : n === 2 ? '2' : '1';
      drawBanner(ctx, label, 'GET READY', Math.min(1, (game.intro % 56) / 28));
    } else if (game.intro === 0 && game.match.frame < 30 && !game.done) {
      drawBanner(ctx, 'GO!', '', Math.max(0, 1 - game.match.frame / 30));
    }
    if (game.done && game.match.winner) {
      drawBanner(ctx, 'GAME!', `${game.match.winner.def.name} WINS`, 1);
    }
  }
}

// ---------------- MAIN LOOP ----------------

function frame(now) {
  if (!game.last) game.last = now;
  let elapsed = now - game.last;
  game.last = now;
  if (elapsed > 250) elapsed = STEP_MS; // tab was backgrounded

  if (game.mode === 'local' && game.match) {
    game.acc += elapsed;
    let steps = 0;
    while (game.acc >= STEP_MS && steps < MAX_STEPS) {
      stepLocal();
      game.acc -= STEP_MS;
      steps++;
    }
    render(game.match);
  } else if (game.mode === 'online') {
    sendOnlineInput();
    if (game.view) render(game.view);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBanner(ctx, 'SYNCING', 'waiting for the server', 1);
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Friendly note in the console.
console.log(
  '%cSMASH ARENA%c  ready. Local play needs no install — just a static server.',
  'color:#42e0ff;font-weight:bold;font-size:14px',
  'color:#8ea4c6',
);
