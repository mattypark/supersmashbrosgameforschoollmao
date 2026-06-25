// Hitbox / hurtbox geometry. Converts a move's facing-relative hitbox tables
// into world-space AABBs, and exposes each fighter's hurtbox.

import { aabb } from '../engine/math.js';

export const BODY_W = 46;
export const BODY_H = 96;
const MID_OFFSET = 52; // fighter.y is the feet; torso sits this far above

// The fighter's vulnerable box (feet-anchored).
export function hurtbox(f) {
  return { x: f.x - BODY_W / 2, y: f.y - BODY_H, w: BODY_W, h: BODY_H };
}

// World-space AABB for a single move hitbox, flipped by facing.
export function worldHitbox(f, hbData) {
  const midX = f.x;
  const midY = f.y - MID_OFFSET;
  const cx = midX + f.facing * hbData.x;
  const cy = midY + hbData.y;
  return {
    x: cx - hbData.w / 2,
    y: cy - hbData.h / 2,
    w: hbData.w,
    h: hbData.h,
  };
}

// All hitboxes active for a fighter on the current frame of its move.
export function activeHitboxes(f) {
  if (!f.move || f.move.kind === 'grab') return [];
  const frame = f.stateFrame;
  const out = [];
  for (const hbData of f.move.hitboxes) {
    if (frame >= hbData.start && frame <= hbData.end) {
      out.push({ box: worldHitbox(f, hbData), data: hbData });
    }
  }
  return out;
}

export const boxesOverlap = aabb;
