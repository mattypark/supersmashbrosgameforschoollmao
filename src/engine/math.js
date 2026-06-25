// Small, dependency-free math helpers shared across the sim and renderer.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const approach = (value, target, step) => {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
};

export const deg = (radians) => (radians * 180) / Math.PI;
export const rad = (degrees) => (degrees * Math.PI) / 180;

// Rotate a 2D vector by an angle in radians.
export const rotate = (x, y, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
};

// Axis-aligned bounding box overlap test.
export const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// Deterministic-ish PRNG (mulberry32) so visual effects can be seeded if needed.
export const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
