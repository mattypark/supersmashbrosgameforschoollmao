// InputManager — turns raw keyboard + Gamepad API state into one normalized,
// per-frame InputState per player. Everything downstream is device-agnostic.
//
// The key fighting-game subtlety lives here: distinguishing a SMASH (fast stick
// flick / fresh direction tap) from a TILT (slow hold). We poll every tick and
// keep a tiny history so both a keyboard and an analog stick can produce a flick.

import { clamp } from './math.js';
import { SMASH_FLICK_WINDOW } from '../game/constants.js';

const DEADZONE = 0.28;
const FLICK_THRESHOLD = 0.62; // analog magnitude that counts as "thrown"
const DIR_THRESHOLD = 0.5; // analog magnitude that counts as "held"

// Default keyboard layout — one key per action, fully rebindable at runtime.
export const KEYBOARD_LAYOUT = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'KeyW',
  down: 'KeyS',
  jump: 'Space',
  attack: 'KeyJ',
  special: 'KeyK',
  shield: 'KeyL',
  grab: 'KeyU',
};

// The actions a player can rebind, in display order.
export const BINDABLE = ['left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'shield', 'grab'];

// Human-readable label for a KeyboardEvent.code.
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5) + ' ▸';
  const map = {
    Space: 'SPACE',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    Period: '.',
    Comma: ',',
    Slash: '/',
    Semicolon: ';',
    Enter: 'ENTER',
    Backspace: 'BKSP',
  };
  return map[code] || code.toUpperCase();
}

// Standard gamepad mapping (Xbox-style "standard" layout).
const PAD = {
  jump: [0], // A
  attack: [2], // X
  special: [3], // Y
  shieldAlt: [1], // B as alt-grab
  grab: [4], // LB
  shield: [5, 6, 7], // RB / LT / RT
};

const emptyState = () => ({
  axisX: 0,
  axisY: 0,
  left: false,
  right: false,
  up: false,
  down: false,
  attackPressed: false,
  attackHeld: false,
  specialPressed: false,
  specialHeld: false,
  jumpPressed: false,
  jumpHeld: false,
  grabPressed: false,
  shieldHeld: false,
  flickX: 0, // -1 / +1 on the frame a horizontal flick fires
  flickY: 0, // -1 / +1 on the frame a vertical flick fires
  connected: false,
  source: 'none',
});

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.prev = new Map(); // playerIndex -> previous raw snapshot (for edges + flicks)
    this.bindings = []; // per-player device binding
    this.layout = { ...KEYBOARD_LAYOUT };
    this._installKeyboard();
  }

  // Swap the keyboard layout (used by the rebinding UI). Missing actions keep
  // their default key.
  setLayout(layout) {
    this.layout = { ...KEYBOARD_LAYOUT, ...layout };
  }

  _installKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Stop the page from scrolling on arrows/space while playing.
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Assign devices to player slots. binding = { type:'keyboard' } | { type:'gamepad', index }
  setBindings(bindings) {
    this.bindings = bindings;
    this.prev.clear();
  }

  // List currently connected gamepads (filtering empty slots).
  static connectedPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...pads].filter((p) => p && p.connected);
  }

  _down(action) {
    return this.keys.has(this.layout[action]);
  }

  _readKeyboard() {
    const x = (this._down('right') ? 1 : 0) - (this._down('left') ? 1 : 0);
    const y = (this._down('down') ? 1 : 0) - (this._down('up') ? 1 : 0);
    return {
      axisX: x,
      axisY: y,
      attack: this._down('attack'),
      special: this._down('special'),
      jump: this._down('jump'),
      grab: this._down('grab'),
      shield: this._down('shield'),
      connected: true,
      source: 'keyboard',
    };
  }

  _readGamepad(index) {
    const pad = (navigator.getGamepads ? navigator.getGamepads() : [])[index];
    if (!pad || !pad.connected) {
      return { ...this._neutralRaw(), connected: false, source: 'gamepad' };
    }
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const dpadX =
      (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    const dpadY =
      (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
    const axisX = Math.abs(ax) > DEADZONE ? ax : dpadX;
    const axisY = Math.abs(ay) > DEADZONE ? ay : dpadY;
    const any = (list) => list.some((b) => pad.buttons[b]?.pressed);
    return {
      axisX: clamp(axisX, -1, 1),
      axisY: clamp(axisY, -1, 1),
      attack: any(PAD.attack),
      special: any(PAD.special),
      jump: any(PAD.jump),
      grab: any(PAD.grab) || any(PAD.shieldAlt),
      shield: any(PAD.shield),
      connected: true,
      source: 'gamepad',
    };
  }

  _neutralRaw() {
    return {
      axisX: 0,
      axisY: 0,
      attack: false,
      special: false,
      jump: false,
      grab: false,
      shield: false,
      connected: false,
      source: 'none',
    };
  }

  _readRaw(binding) {
    if (!binding) return { ...this._neutralRaw() };
    if (binding.type === 'keyboard') return this._readKeyboard();
    if (binding.type === 'gamepad') return this._readGamepad(binding.index);
    return { ...this._neutralRaw() };
  }

  // Produce the clean per-player InputState for this frame.
  getState(playerIndex) {
    const raw = this._readRaw(this.bindings[playerIndex]);
    const prev = this.prev.get(playerIndex) || this._neutralRaw();
    const state = emptyState();

    state.axisX = raw.axisX;
    state.axisY = raw.axisY;
    state.connected = raw.connected;
    state.source = raw.source;
    state.left = raw.axisX < -DIR_THRESHOLD;
    state.right = raw.axisX > DIR_THRESHOLD;
    state.up = raw.axisY < -DIR_THRESHOLD;
    state.down = raw.axisY > DIR_THRESHOLD;

    // Edge-triggered buttons (pressed THIS frame).
    state.attackPressed = raw.attack && !prev.attack;
    state.attackHeld = raw.attack;
    state.specialPressed = raw.special && !prev.special;
    state.specialHeld = raw.special;
    state.jumpPressed = raw.jump && !prev.jump;
    state.jumpHeld = raw.jump;
    state.grabPressed = raw.grab && !prev.grab;
    state.shieldHeld = raw.shield;

    // Flick detection: stick crossed from inside the deadzone past the flick
    // threshold this frame. On a keyboard a fresh key-press IS a flick.
    const prevMagX = Math.abs(prev.axisX);
    const prevMagY = Math.abs(prev.axisY);
    if (Math.abs(raw.axisX) >= FLICK_THRESHOLD && prevMagX < DIR_THRESHOLD) {
      state.flickX = Math.sign(raw.axisX);
    }
    if (Math.abs(raw.axisY) >= FLICK_THRESHOLD && prevMagY < DIR_THRESHOLD) {
      state.flickY = Math.sign(raw.axisY);
    }

    this.prev.set(playerIndex, raw);
    return state;
  }
}

// A short-lived helper a fighter uses to decide smash vs tilt: it remembers how
// long ago a directional flick happened so an attack pressed within the window
// still counts as a smash. One per player, owned by the fighter.
export class FlickMemory {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.xAge = 999;
    this.yAge = 999;
  }
  update(state) {
    this.xAge++;
    this.yAge++;
    if (state.flickX) {
      this.x = state.flickX;
      this.xAge = 0;
    }
    if (state.flickY) {
      this.y = state.flickY;
      this.yAge = 0;
    }
  }
  smashDir() {
    // Returns the freshest valid smash direction, or null.
    if (this.yAge <= SMASH_FLICK_WINDOW && this.yAge <= this.xAge) {
      return this.y < 0 ? 'up' : 'down';
    }
    if (this.xAge <= SMASH_FLICK_WINDOW) {
      return this.x < 0 ? 'left' : 'right';
    }
    return null;
  }
  consume() {
    this.xAge = 999;
    this.yAge = 999;
  }
}
