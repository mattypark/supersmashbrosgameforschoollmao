// Particle + screen-effect system. Consumes match.events each tick and renders
// hit sparks, KO blasts, dust, and shield flashes. Pure presentation — never
// touches the simulation.

import { makeRng } from '../engine/math.js';

const rng = makeRng(1337);

export class Effects {
  constructor() {
    this.particles = [];
    this.flashes = [];
    this.koFlash = 0;
  }

  ingest(events) {
    for (const ev of events) {
      if (ev.type === 'spark') this._spark(ev);
      else if (ev.type === 'blast') this._blast(ev);
      else if (ev.type === 'shieldhit') this._shield(ev);
    }
  }

  _spark(ev) {
    const count = ev.small ? 6 : Math.min(34, 10 + ev.power * 0.3);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const sp = (ev.small ? 2 : 3) + rng() * (ev.power * 0.12 + 4);
      this.particles.push({
        x: ev.x,
        y: ev.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 14 + rng() * 16,
        max: 30,
        size: 2 + rng() * 3,
        color: rng() < 0.5 ? '#ffffff' : ev.color,
        grav: 0.12,
      });
    }
    // a bright impact ring
    this.flashes.push({ x: ev.x, y: ev.y, r: ev.small ? 8 : 14, life: 10, max: 10, color: ev.spike ? '#ff5470' : ev.color });
  }

  _blast(ev) {
    this.koFlash = 1;
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 4 + rng() * 12;
      this.particles.push({
        x: ev.x,
        y: ev.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 24 + rng() * 24,
        max: 48,
        size: 3 + rng() * 4,
        color: rng() < 0.4 ? '#ffffff' : ev.color,
        grav: 0.04,
      });
    }
    this.flashes.push({ x: ev.x, y: ev.y, r: 30, life: 22, max: 22, color: ev.color, big: true });
  }

  _shield(ev) {
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 2 + rng() * 3;
      this.particles.push({
        x: ev.x,
        y: ev.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 8 + rng() * 8,
        max: 16,
        size: 2 + rng() * 2,
        color: '#bfe9ff',
        grav: 0.02,
      });
    }
  }

  update() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.vx *= 0.96;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const fl of this.flashes) {
      fl.r += fl.big ? 6 : 3;
      fl.life--;
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    if (this.koFlash > 0) this.koFlash -= 0.06;
  }

  draw(ctx) {
    ctx.save();
    // impact rings
    for (const fl of this.flashes) {
      const a = fl.life / fl.max;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = fl.color;
      ctx.lineWidth = fl.big ? 6 : 3;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  // White flash overlay drawn in screen space on a KO.
  drawScreenFlash(ctx, w, h) {
    if (this.koFlash <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.koFlash) * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
