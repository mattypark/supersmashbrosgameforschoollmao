// Screen + setup-UI controller. Owns the DOM for title / character-select /
// controls / results / online, and hands the main loop a finished match config.

import { ROSTER, getCharacterIndex } from '../data/characters.js';
import { InputManager, BINDABLE, keyLabel, KEYBOARD_LAYOUT } from '../engine/input.js';

const ACTION_LABELS = {
  left: 'MOVE LEFT',
  right: 'MOVE RIGHT',
  up: 'AIM UP',
  down: 'CROUCH / FAST-FALL',
  jump: 'JUMP',
  attack: 'ATTACK',
  special: 'SPECIAL',
  shield: 'SHIELD / DODGE',
  grab: 'GRAB',
};

const norm = (v, lo, hi) => Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.screens = {
      title: document.getElementById('screen-title'),
      setup: document.getElementById('screen-setup'),
      game: document.getElementById('screen-game'),
      results: document.getElementById('screen-results'),
      online: document.getElementById('screen-online'),
      controls: document.getElementById('screen-controls'),
    };
    // each slot: { type:'human'|'cpu'|'off', charIndex, skinIndex, device }
    this.slots = [
      { type: 'human', charIndex: 0, skinIndex: 0, device: { type: 'keyboard' } },
      { type: 'cpu', charIndex: 1, skinIndex: 0, device: { type: 'keyboard' } },
      { type: 'off', charIndex: 2, skinIndex: 0, device: { type: 'keyboard' } },
      { type: 'off', charIndex: 3, skinIndex: 0, device: { type: 'keyboard' } },
    ];
    this.stocks = 3;
    this.layout = { ...KEYBOARD_LAYOUT, ...(handlers.layout || {}) };
    this.onlineChar = 0;
    this.onlineSkin = 0;

    this._wireTitle();
    this._wireSetup();
    this._wireResults();
    this._wireOnline();
    this._wireControls();
    window.addEventListener('gamepadconnected', () => this._renderSlots());
    window.addEventListener('gamepaddisconnected', () => this._renderSlots());
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('is-active', key === name);
    }
  }

  // ---------- title ----------
  _wireTitle() {
    this.screens.title.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this.handlers.onSound?.('select');
        const a = b.dataset.action;
        if (a === 'local') {
          this._renderSlots();
          this.show('setup');
        } else if (a === 'online') {
          this._renderOnlineChars();
          this.show('online');
        } else if (a === 'controls') {
          this._renderControls();
          this.show('controls');
        }
      });
    });
  }

  // ---------- setup ----------
  _wireSetup() {
    this.screens.setup
      .querySelector('[data-action="back"]')
      .addEventListener('click', () => this.show('title'));

    this.screens.setup.querySelectorAll('#stock-seg button').forEach((b) => {
      b.addEventListener('click', () => {
        this.screens.setup.querySelectorAll('#stock-seg button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.stocks = Number(b.dataset.stock);
        this.handlers.onSound?.('select');
      });
    });

    document.getElementById('start-btn').addEventListener('click', () => {
      const config = this.buildConfig();
      if (config.players.length < 2) return;
      this.handlers.onSound?.('confirm');
      this.handlers.onStart(config);
    });
  }

  _deviceOptions() {
    const opts = [{ value: 'keyboard', label: 'Keyboard' }];
    InputManager.connectedPads().forEach((p) => {
      opts.push({ value: `pad:${p.index}`, label: `Gamepad ${p.index + 1}` });
    });
    return opts;
  }

  _deviceValue(device) {
    return device.type === 'keyboard' ? 'keyboard' : `pad:${device.index}`;
  }

  _renderSlots() {
    const grid = document.getElementById('slot-grid');
    grid.innerHTML = '';
    const deviceOpts = this._deviceOptions();

    this.slots.forEach((slot, i) => {
      const char = ROSTER[slot.charIndex];
      const skin = char.skins[slot.skinIndex] || char.skins[0];
      const active = slot.type !== 'off';
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.active = String(active);
      el.style.setProperty('--slot-color', skin[0]);
      el.style.setProperty('--slot-color-2', skin[1]);

      const typeLabel = { human: 'YOU', cpu: 'CPU', off: 'OFF' }[slot.type];
      const skinDots = char.skins
        .map(
          (s, si) =>
            `<div class="skin-dot ${si === slot.skinIndex ? 'on' : ''}" data-skin="${si}" style="background:${s[0]};color:${s[0]}"></div>`,
        )
        .join('');
      const deviceSel =
        slot.type === 'human'
          ? `<div class="device-row">🎮
              <select data-device>${deviceOpts
                .map((o) => `<option value="${o.value}" ${this._deviceValue(slot.device) === o.value ? 'selected' : ''}>${o.label}</option>`)
                .join('')}</select></div>`
          : '';

      el.innerHTML = `
        <div class="slot-top">
          <span class="slot-label">P${i + 1}</span>
          <button class="type-cycle" data-cycle>${typeLabel}</button>
        </div>
        <div class="slot-portrait">
          <div class="fighter-glyph"><span class="head"></span><span class="visor"></span><span class="body"></span></div>
        </div>
        <div class="char-cycle">
          <button class="char-arrow" data-arrow="-1">‹</button>
          <div class="fighter-name">${char.name}</div>
          <button class="char-arrow" data-arrow="1">›</button>
        </div>
        <div class="fighter-tag">${char.tag.toUpperCase()}</div>
        <div class="skin-dots">${skinDots}</div>
        ${deviceSel}
        <div class="stat-bars">
          ${this._statRow('SPEED', norm(char.run, 4.5, 9.5))}
          ${this._statRow('WEIGHT', norm(char.weight, 70, 140))}
          ${this._statRow('AIR', norm(char.airSpeed, 4, 6.8))}
          ${this._statRow('JUMPS', norm(char.jumps, 2, 5))}
        </div>`;

      el.querySelector('[data-cycle]').addEventListener('click', () => {
        const order = ['human', 'cpu', 'off'];
        slot.type = order[(order.indexOf(slot.type) + 1) % order.length];
        this.handlers.onSound?.('select');
        this._renderSlots();
        this._updateStart();
      });
      el.querySelectorAll('[data-arrow]').forEach((arr) => {
        arr.addEventListener('click', () => {
          const dir = Number(arr.dataset.arrow);
          slot.charIndex = (slot.charIndex + dir + ROSTER.length) % ROSTER.length;
          slot.skinIndex = 0;
          this.handlers.onSound?.('select');
          this._renderSlots();
        });
      });
      el.querySelectorAll('[data-skin]').forEach((dot) => {
        dot.addEventListener('click', () => {
          slot.skinIndex = Number(dot.dataset.skin);
          this.handlers.onSound?.('select');
          this._renderSlots();
        });
      });
      const sel = el.querySelector('[data-device]');
      if (sel) {
        sel.addEventListener('change', () => {
          const v = sel.value;
          slot.device = v === 'keyboard' ? { type: 'keyboard' } : { type: 'gamepad', index: Number(v.split(':')[1]) };
        });
      }
      grid.appendChild(el);
    });
    this._updateStart();
  }

  _statRow(label, frac) {
    return `<div class="row"><span>${label}</span><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div></div>`;
  }

  _updateStart() {
    const active = this.slots.filter((s) => s.type !== 'off').length;
    document.getElementById('start-btn').disabled = active < 2;
  }

  buildConfig() {
    const players = this.slots
      .filter((s) => s.type !== 'off')
      .map((s) => ({
        charId: ROSTER[s.charIndex].id,
        skin: s.skinIndex,
        type: s.type,
        binding:
          s.type === 'human'
            ? s.device.type === 'keyboard'
              ? { type: 'keyboard' }
              : { type: 'gamepad', index: s.device.index }
            : null,
      }));
    return { players, stocks: this.stocks };
  }

  // ---------- controls / rebinding ----------
  _wireControls() {
    this.screens.controls.querySelectorAll('[data-action="back"]').forEach((b) =>
      b.addEventListener('click', () => {
        this.handlers.onSound?.('select');
        this.show('title');
      }),
    );
    document.getElementById('reset-controls').addEventListener('click', () => {
      this.layout = { ...KEYBOARD_LAYOUT };
      this.handlers.onControlsChange?.(this.layout);
      this.handlers.onSound?.('confirm');
      this._renderControls();
    });
  }

  _renderControls() {
    const grid = document.getElementById('bind-grid');
    grid.innerHTML = '';
    for (const action of BINDABLE) {
      const row = document.createElement('div');
      row.className = 'bind-row';
      row.innerHTML = `<span>${ACTION_LABELS[action]}</span><button class="bind-key" data-action="${action}">${keyLabel(this.layout[action])}</button>`;
      const btn = row.querySelector('.bind-key');
      btn.addEventListener('click', () => this._listenForKey(action, btn));
      grid.appendChild(row);
    }
  }

  _listenForKey(action, btn) {
    if (this._listening) return;
    this._listening = true;
    btn.classList.add('listening');
    btn.textContent = 'PRESS…';
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', handler, true);
      this._listening = false;
      btn.classList.remove('listening');
      if (e.code !== 'Escape') {
        // avoid two actions sharing one key
        for (const a of BINDABLE) if (a !== action && this.layout[a] === e.code) this.layout[a] = '';
        this.layout[action] = e.code;
        this.handlers.onControlsChange?.(this.layout);
        this.handlers.onSound?.('select');
      }
      this._renderControls();
    };
    window.addEventListener('keydown', handler, true);
  }

  // ---------- results ----------
  _wireResults() {
    this.screens.results.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this.handlers.onSound?.('select');
        if (b.dataset.action === 'rematch') this.handlers.onRematch();
        else this.show('title');
      });
    });
  }

  showResults(winner) {
    const nameEl = document.getElementById('winner-name');
    const art = document.getElementById('winner-art');
    if (winner) {
      nameEl.textContent = `${winner.def.name} WINS`;
      nameEl.style.color = winner.color || winner.def.color;
      const c = winner.color || winner.def.color;
      const c2 = winner.color2 || winner.def.color2;
      art.innerHTML = `<div class="fighter-glyph" style="--slot-color:${c};--slot-color-2:${c2};width:140px;height:176px"><span class="head"></span><span class="visor"></span><span class="body"></span></div>`;
    } else {
      nameEl.textContent = 'DRAW';
      nameEl.style.color = '#fff';
      art.innerHTML = '';
    }
    this.show('results');
  }

  // ---------- online ----------
  _wireOnline() {
    this.screens.online.querySelector('[data-action="back"]').addEventListener('click', () => this.show('title'));
    document.getElementById('join-btn').addEventListener('click', () => {
      const url = document.getElementById('server-url').value.trim();
      const name = document.getElementById('player-name').value.trim() || 'P?';
      this.handlers.onOnlineJoin?.({ url, name, charId: ROSTER[this.onlineChar].id, skin: this.onlineSkin });
    });
  }

  _renderOnlineChars() {
    const row = document.getElementById('online-chars');
    row.innerHTML = ROSTER.map(
      (c, i) =>
        `<div class="skin-dot ${i === this.onlineChar ? 'on' : ''}" data-char="${i}" title="${c.name}" style="background:${c.color};color:${c.color};width:34px;height:34px;border-radius:9px"></div>`,
    ).join('');
    row.querySelectorAll('[data-char]').forEach((sw) => {
      sw.addEventListener('click', () => {
        this.onlineChar = Number(sw.dataset.char);
        this.onlineSkin = 0;
        this._renderOnlineChars();
      });
    });
  }

  log(msg) {
    const el = document.getElementById('online-log');
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
  }
}
