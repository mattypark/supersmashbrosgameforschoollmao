// Canvas2D renderer. Draws the arena, fighters, projectiles and applies screen
// shake. Fighters are stylized vector forms (no sprite assets) with active
// hitboxes telegraphed as additive energy slashes so combat reads clearly.

import { STAGE_WIDTH, STAGE_HEIGHT, BLAST } from '../game/constants.js';
import { STAGE } from '../game/stage.js';
import { activeHitboxes, hurtbox, BODY_W, BODY_H } from '../game/hitbox.js';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawWorld(ctx, match, effects) {
  const shake = match.shake;
  ctx.save();
  if (shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  drawBackground(ctx, match.frame);
  drawStage(ctx);

  for (const p of match.projectiles) drawProjectile(ctx, p);
  for (const f of match.fighters) {
    if (f.dead) continue;
    drawFighter(ctx, f, match.frame);
  }
  drawBlastHints(ctx, match.fighters);

  effects.draw(ctx);
  ctx.restore();
}

function drawBackground(ctx, frame) {
  const g = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.55, '#0b0f1c');
  g.addColorStop(1, '#06080f');
  ctx.fillStyle = g;
  ctx.fillRect(-300, -300, STAGE_WIDTH + 600, STAGE_HEIGHT + 600);

  // diagonal energy streaks
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#3aa0ff';
  ctx.lineWidth = 2;
  const off = (frame * 0.6) % 90;
  for (let x = -200; x < STAGE_WIDTH + 200; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x + off, -100);
    ctx.lineTo(x + off - 220, STAGE_HEIGHT + 100);
    ctx.stroke();
  }
  ctx.restore();

  // subtle grid
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#6fb4ff';
  ctx.lineWidth = 1;
  for (let y = 80; y < STAGE_HEIGHT; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();

  // glow behind the stage
  const glow = ctx.createRadialGradient(640, 470, 60, 640, 470, 520);
  glow.addColorStop(0, 'rgba(60,140,255,0.16)');
  glow.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
}

function drawStage(ctx) {
  const b = STAGE.ground;
  // main block body
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, '#1b2740');
  g.addColorStop(1, '#0c1322');
  ctx.fillStyle = g;
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  // neon top edge
  ctx.strokeStyle = '#42e0ff';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#42e0ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x + b.w, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ledges
  for (const lg of STAGE.ledges) {
    ctx.fillStyle = '#42e0ff';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(lg.x - 4, lg.y - 4, 8, 14);
    ctx.globalAlpha = 1;
  }

  // soft platforms
  for (const p of STAGE.platforms) {
    const pg = ctx.createLinearGradient(0, p.y, 0, p.y + 14);
    pg.addColorStop(0, '#27406b');
    pg.addColorStop(1, '#16243d');
    ctx.fillStyle = pg;
    roundRect(ctx, p.x, p.y, p.w, 12, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 4, p.y);
    ctx.lineTo(p.x + p.w - 4, p.y);
    ctx.stroke();
  }
}

const P_TAGS = ['P1', 'P2', 'P3', 'P4'];

function drawFighter(ctx, f, frame) {
  const blink = f.invuln > 0 && frame % 6 < 3;
  const face = f.facingVisual >= 0 ? 1 : -1;
  const cx = f.x;
  const topY = f.y - BODY_H;

  // ground shadow
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, f.y + 2, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (blink) ctx.globalAlpha = 0.4;

  // charging aura
  if (f.charging && f.charge > 0) {
    const pulse = 0.4 + 0.3 * Math.sin(frame * 0.6);
    ctx.save();
    ctx.globalAlpha = (f.charge / 60) * pulse;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(cx, f.y - 48, 50 + f.charge * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // body
  const bodyW = BODY_W;
  const grad = ctx.createLinearGradient(cx, topY, cx, f.y);
  grad.addColorStop(0, f.color);
  grad.addColorStop(1, f.color2);
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, cx - bodyW / 2, topY + 20, bodyW, BODY_H - 20, 14);
  ctx.fill();
  ctx.stroke();

  // legs (slight motion when moving)
  ctx.fillStyle = f.color2;
  const legSpread = f.grounded && Math.abs(f.vx) > 1 ? Math.sin(frame * 0.4) * 5 : 4;
  roundRect(ctx, cx - 14 - legSpread, f.y - 22, 10, 22, 4);
  ctx.fill();
  roundRect(ctx, cx + 4 + legSpread, f.y - 22, 10, 22, 4);
  ctx.fill();

  // head
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.arc(cx, topY + 14, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();

  // visor / eye facing forward
  ctx.fillStyle = '#0a0f1a';
  roundRect(ctx, cx + face * 2 - 6, topY + 8, 14, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx + face * 6 - 2, topY + 9, 5, 5, 2);
  ctx.fill();

  ctx.restore();

  // active hitboxes as additive energy slashes
  const boxes = activeHitboxes(f);
  if (boxes.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const { box } of boxes) {
      const grd = ctx.createRadialGradient(
        box.x + box.w / 2,
        box.y + box.h / 2,
        2,
        box.x + box.w / 2,
        box.y + box.h / 2,
        Math.max(box.w, box.h) / 1.4,
      );
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(0.4, f.color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 1.7, box.h / 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // shield bubble
  if (f.state === 'shield') {
    const r = 26 + (f.shieldHP / 100) * 18;
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(cx, f.y - 48, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#dff3ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // hit flash
  if (f.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, f.hitFlash / 10);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cx - bodyW / 2 - 2, topY, bodyW + 4, BODY_H, 14);
    ctx.fill();
    ctx.restore();
  }

  // player tag
  ctx.save();
  ctx.fillStyle = f.color;
  ctx.font = '700 13px "Chakra Petch", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(P_TAGS[f.index] || '', cx, topY - 10);
  ctx.beginPath();
  ctx.moveTo(cx - 5, topY - 6);
  ctx.lineTo(cx + 5, topY - 6);
  ctx.lineTo(cx, topY - 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawProjectile(ctx, p) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.spec.w);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.4, p.color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.spec.w, p.spec.h, 0, 0, Math.PI * 2);
  ctx.fill();
  // trail
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(p.x - p.vx * 1.4, p.y - p.vy * 1.4, p.spec.w * 0.6, p.spec.h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Off-screen arrows pointing at fighters who are near a blast zone.
function drawBlastHints(ctx, fighters) {
  for (const f of fighters) {
    if (f.dead) continue;
    const nearEdge =
      f.x < 40 || f.x > STAGE_WIDTH - 40 || f.y < 30 || f.y > STAGE_HEIGHT - 20;
    if (!nearEdge) continue;
    const ax = Math.max(24, Math.min(STAGE_WIDTH - 24, f.x));
    const ay = Math.max(24, Math.min(STAGE_HEIGHT - 24, f.y - 40));
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.0); // static; pulse handled by danger color
    ctx.fillStyle = f.percent > 90 ? '#ff5470' : f.color;
    ctx.beginPath();
    ctx.arc(ax, ay, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
