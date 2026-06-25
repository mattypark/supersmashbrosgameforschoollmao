// Tiny synthesized sound engine — no audio files. Everything is generated with
// oscillators + noise bursts so the game stays a zero-asset download.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastPlay = {};
  }

  // Must be called from a user gesture (click / keypress) to satisfy autoplay.
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, type = 'square', gain = 0.5, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain = 0.5, hp = 800) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    // throttle identical sounds firing on the same frame
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.02) return;
    this.lastPlay[name] = now;

    switch (name) {
      case 'hit':
        this._noise(0.09, 0.5, 1200);
        this._tone(220, 0.1, 'square', 0.3, 140);
        break;
      case 'hitBig':
        this._noise(0.18, 0.7, 600);
        this._tone(160, 0.22, 'sawtooth', 0.4, 70);
        break;
      case 'ko':
        this._tone(600, 0.5, 'sawtooth', 0.4, 80);
        this._noise(0.3, 0.4, 300);
        break;
      case 'jump':
        this._tone(320, 0.12, 'sine', 0.3, 620);
        break;
      case 'shield':
        this._tone(440, 0.12, 'sine', 0.25, 520);
        break;
      case 'shoot':
        this._tone(880, 0.08, 'square', 0.22, 1400);
        break;
      case 'select':
        this._tone(520, 0.07, 'square', 0.3, 780);
        break;
      case 'confirm':
        this._tone(420, 0.09, 'square', 0.32, 640);
        this._tone(640, 0.12, 'square', 0.28, 880);
        break;
      default:
        break;
    }
  }
}
