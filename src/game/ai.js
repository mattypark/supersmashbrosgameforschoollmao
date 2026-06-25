// Lightweight CPU. Emits the exact same InputState a human device produces, so
// the fighter sim never knows the difference. Good enough to spar against and to
// fill empty slots for solo testing.

import { STAGE, stageCenterX } from './stage.js';

const neutral = () => ({
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
  flickX: 0,
  flickY: 0,
  connected: true,
  source: 'cpu',
});

function nearestTarget(f, match) {
  let best = null;
  let bestD = Infinity;
  for (const o of match.fighters) {
    if (o === f || o.dead) continue;
    const d = Math.hypot(o.x - f.x, o.y - f.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function computeCpuInput(f, match) {
  if (!f.ai) f.ai = { t: 0, attackCd: 0, jumpCd: 0, decision: 0, dir: 1 };
  const ai = f.ai;
  ai.t++;
  if (ai.attackCd > 0) ai.attackCd--;
  if (ai.jumpCd > 0) ai.jumpCd--;

  const inp = neutral();
  if (f.dead) return inp;

  const g = STAGE.ground;
  const offLeft = f.x < g.x - 24;
  const offRight = f.x > g.x + g.w + 24;
  const offStage = offLeft || offRight;
  const belowStage = f.y > g.y + 30;

  // --- Recovery: get back before anything else ---
  if (offStage || belowStage) {
    const toward = stageCenterX() - f.x;
    inp.axisX = Math.sign(toward);
    inp.right = toward > 0;
    inp.left = toward < 0;
    // jump / up-special back
    if (f.y > g.y - 40 || belowStage) {
      if (!f.grounded && ai.jumpCd === 0 && f.jumpsUsed < f.def.jumps - 1) {
        inp.jumpPressed = true;
        inp.jumpHeld = true;
        ai.jumpCd = 16;
      } else if (f.y > g.y + 70 && ai.attackCd === 0) {
        inp.up = true;
        inp.axisY = -1;
        inp.specialPressed = true; // up-special recovery
        ai.attackCd = 30;
      }
    }
    return inp;
  }

  const target = nearestTarget(f, match);
  if (!target) return inp;
  const dx = target.x - f.x;
  const dy = target.y - f.y;
  const adist = Math.abs(dx);
  const dir = Math.sign(dx) || f.facing;

  // Approach.
  inp.axisX = Math.max(-1, Math.min(1, dx / 60));
  inp.right = dx > 14;
  inp.left = dx < -14;

  // Shield if the target is very close and swinging.
  if (adist < 64 && target.state === 'attack' && Math.random() < 0.16) {
    inp.shieldHeld = true;
    return inp;
  }

  // Jump toward airborne targets.
  if (dy < -70 && f.grounded && ai.jumpCd === 0 && Math.random() < 0.5) {
    inp.jumpPressed = true;
    inp.jumpHeld = true;
    ai.jumpCd = 24;
  }

  // Attack when in range.
  if (adist < 92 && ai.attackCd === 0) {
    const roll = Math.random();
    if (!f.grounded) {
      // aerial
      if (dy < -30) inp.up = true;
      else if (dy > 40) {
        inp.down = true;
        inp.axisY = 1;
      } else {
        inp.axisX = dir;
        inp[dir > 0 ? 'right' : 'left'] = true;
      }
      inp.attackPressed = true;
      ai.attackCd = 16;
    } else if (roll < 0.18) {
      // smash (flick + attack)
      inp.flickX = dir;
      inp.axisX = dir;
      inp[dir > 0 ? 'right' : 'left'] = true;
      inp.attackPressed = true;
      ai.attackCd = 40;
    } else if (roll < 0.34) {
      inp.specialPressed = true;
      ai.attackCd = 36;
    } else if (roll < 0.46 && adist < 52) {
      inp.grabPressed = true;
      ai.attackCd = 36;
    } else {
      if (dy < -40) inp.up = true;
      inp.attackPressed = true;
      ai.attackCd = 18;
    }
  }

  return inp;
}
