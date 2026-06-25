// The heart of the "Smash feel": percent-based knockback, hitstun, and DI.
// Formula adapted from SmashWiki's knockback page.

import {
  KB_DAMAGE_RATIO,
  KB_LAUNCH_SPEED,
  HITSTUN_PER_KB,
  DI_MAX_RADIANS,
} from './constants.js';
import { rad, clamp } from '../engine/math.js';

// Compute raw knockback units.
//   percent  = victim's percent AFTER this hit's damage is applied
//   damage   = move damage
//   weight   = victim weight (heavier = launched less)
//   base     = per-hitbox base knockback (minimum launch at 0%)
//   growth   = per-hitbox knockback growth (how fast it scales with percent)
export function knockback({ percent, damage, weight, base, growth }) {
  const p = percent;
  const d = damage;
  const w = weight;
  const s = growth / 100;
  const damageTerm = (p / 10 + (p * d) / 20) * (200 / (w + 100)) * KB_DAMAGE_RATIO;
  return (damageTerm + 18) * s + base;
}

// Frames the victim is locked in hitstun.
export function hitstun(kb) {
  return Math.max(0, Math.round(kb * HITSTUN_PER_KB));
}

// Convert knockback + launch angle into a velocity vector, applying the
// victim's directional influence (DI). DI rotates the angle up to ±18° based on
// how perpendicular the held stick is to the launch trajectory.
//
//   angleDeg : authored launch angle of the hitbox (0 = right, 90 = up)
//   facing   : attacker facing (+1 right / -1 left) — flips the angle
//   diX/diY  : victim's current stick input (-1..1)
export function launchVelocity({ kb, angleDeg, facing, diX, diY }) {
  let angle = rad(angleDeg);
  // Mirror the angle to point away from the attacker.
  if (facing < 0) angle = Math.PI - angle;

  // Launch direction unit vector. Screen-space y grows downward, so negate.
  let dirX = Math.cos(angle);
  let dirY = -Math.sin(angle);

  // Directional influence: take the component of the stick perpendicular to the
  // launch vector and rotate the angle toward it (capped at ±18°).
  const mag = Math.hypot(diX, diY);
  if (mag > 0.2) {
    const nx = diX / mag;
    const ny = diY / mag;
    // Perpendicular of the launch direction.
    const perpX = -dirY;
    const perpY = dirX;
    const along = nx * perpX + ny * perpY; // -1..1
    const turn = clamp(along, -1, 1) * DI_MAX_RADIANS;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const rx = dirX * c - dirY * sn;
    const ry = dirX * sn + dirY * c;
    dirX = rx;
    dirY = ry;
  }

  const speed = kb * KB_LAUNCH_SPEED;
  return { vx: dirX * speed, vy: dirY * speed };
}

// Hitlag (freeze frames) felt on a clean hit, scaled by damage.
export function hitlagFrames(damage) {
  return Math.min(22, Math.round(4 + damage * 0.45));
}
