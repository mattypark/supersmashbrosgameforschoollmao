// The roster — 15 fighters, each defined as DATA. Standard normals come from a
// scaled move factory (buildKit); every fighter then overrides its four SPECIALS
// (and occasionally a signature normal) to give it a distinct identity. Each
// fighter also ships 4 alternate color SKINS so two players can pick the same
// character in different colors.
//
// Hitbox geometry: x/y offset from the fighter's mid-torso in facing-forward
// space (+x = in front, -y = above / +y = below, matching screen space). The
// collision layer flips x by facing and converts to world (worldY = midTorso+y).
// Angles: 0 = forward, 90 = up, ~270-280 = down (a meteor/spike).

// hb(start, end, dmg, base, growth, angle, x, y, w, h)
const hb = (start, end, dmg, base, growth, angle, x, y, w = 78, h = 78) => ({
  start, end, dmg, base, growth, angle, x, y, w, h,
});

const move = (name, total, hitboxes, extra = {}) => ({ name, total, hitboxes, ...extra });

// --- special-move shorthands ------------------------------------------------
const proj = (name, total, p) => move(name, total, [], { kind: 'special', projectile: p });
const recov = (name, total, hbox, r, helpless = true) =>
  move(name, total, hbox, { kind: 'special', recovery: r, helpless });
const melee = (name, total, hbox, extra = {}) => move(name, total, hbox, { kind: 'special', ...extra });
const counter = (name, total, c) =>
  move(name, total, [], { kind: 'special', counter: c });

// Build a complete balanced kit scaled by an archetype profile.
function buildKit({ s = 1, d = 1, k = 1, f = 1 } = {}) {
  const F = (n) => Math.round(n * f);
  const D = (n) => Math.round(n * d);
  const K = (n) => Math.round(n * k);
  const R = (n) => Math.round(n * s);

  return {
    jab: move('Jab Combo', F(22), [
      hb(F(3), F(5), D(2), 6, K(12), 80, R(42), 2, R(50), R(46)),
      hb(F(9), F(12), D(4), 14, K(34), 50, R(50), 2, R(58), R(48)),
    ], { kind: 'ground' }),
    ftilt: move('Forward Tilt', F(22), [hb(F(6), F(10), D(8), 16, K(58), 36, R(56), 4, R(70), R(56))], { kind: 'ground' }),
    utilt: move('Up Tilt', F(22), [hb(F(6), F(11), D(7), 22, K(66), 92, R(8), -R(70), R(64), R(78))], { kind: 'ground' }),
    dtilt: move('Down Tilt', F(18), [hb(F(5), F(9), D(6), 12, K(42), 26, R(50), R(34), R(66), R(40))], { kind: 'ground' }),
    dash: move('Dash Attack', F(26), [hb(F(8), F(14), D(9), 48, K(52), 48, R(46), 0, R(74), R(64))], { kind: 'ground', momentum: 0.4 }),
    fsmash: move('Forward Smash', F(38), [hb(F(12), F(17), D(16), 24, K(92), 35, R(70), 2, R(88), R(64))], { kind: 'ground', smash: true }),
    usmash: move('Up Smash', F(36), [hb(F(11), F(16), D(15), 28, K(92), 88, R(6), -R(80), R(74), R(94))], { kind: 'ground', smash: true }),
    dsmash: move('Down Smash', F(34), [
      hb(F(9), F(13), D(13), 32, K(74), 28, R(58), R(30), R(80), R(40)),
      hb(F(9), F(13), D(13), 32, K(74), 145, -R(58), R(30), R(80), R(40)),
    ], { kind: 'ground', smash: true }),
    nair: move('Neutral Air', F(30), [
      hb(F(5), F(9), D(4), 10, K(30), 50, R(38), -R(24), R(82), R(82)),
      hb(F(12), F(18), D(6), 14, K(56), 45, 0, -R(28), R(96), R(96)),
    ], { kind: 'aerial' }),
    fair: move('Forward Air', F(30), [hb(F(8), F(14), D(10), 14, K(58), 40, R(54), -R(20), R(70), R(64))], { kind: 'aerial' }),
    bair: move('Back Air', F(28), [hb(F(7), F(12), D(11), 16, K(64), 140, -R(56), -R(20), R(70), R(60))], { kind: 'aerial' }),
    uair: move('Up Air', F(28), [hb(F(6), F(12), D(9), 18, K(70), 86, 0, -R(74), R(70), R(72))], { kind: 'aerial' }),
    dair: move('Down Air', F(34), [hb(F(10), F(18), D(12), 16, K(56), 278, R(8), R(58), R(58), R(74))], { kind: 'aerial', spike: true }),
    grab: move('Grab', F(30), [], { kind: 'grab', range: R(56), throwDmg: D(9), throwBase: 60, throwGrowth: K(58), throwAngle: 45 }),
    // sensible default specials (most fighters override all four)
    nspecial: proj('Neutral Special', 30, { spawn: 10, speed: 10, life: 56, dmg: 6, base: 12, growth: 36, angle: 8, w: 32, h: 22, gravity: 0 }),
    sspecial: melee('Side Special', 34, [hb(10, 18, 11, 52, 60, 30, R(56), 0, R(72), R(60))], { recovery: { vx: 13, vy: -2 }, momentum: 0.8 }),
    uspecial: recov('Up Special', 32, [hb(4, 13, 9, 30, 56, 82, 0, -R(46), R(82), R(104))], { vx: 7, vy: -17 }),
    dspecial: counter('Down Special', 40, { start: 6, end: 22, mult: 1.3, base: 40, growth: 78, angle: 45 }),
  };
}

// Assemble a finished character from a compact spec.
function makeChar(spec) {
  const kit = buildKit(spec.profile || {});
  Object.assign(kit, spec.moves || {});
  const [c0, c1] = spec.skins[0];
  return {
    id: spec.id,
    name: spec.name,
    tag: spec.tag,
    blurb: spec.blurb,
    color: c0,
    color2: c1,
    skins: spec.skins,
    weight: spec.weight,
    walk: spec.walk,
    run: spec.run,
    airSpeed: spec.airSpeed,
    airAccel: spec.airAccel,
    gravity: spec.gravity,
    fall: spec.fall,
    jumpV: spec.jumpV,
    hopV: spec.hopV,
    doubleJumpV: spec.doubleJumpV,
    jumps: spec.jumps,
    moves: kit,
  };
}

// ============================================================================
// ROSTER SPECS
// ============================================================================
const SPECS = [
  {
    id: 'volt', name: 'VOLT', tag: 'All-Rounder',
    blurb: 'Even stats, reliable kills, a zippy plasma bolt to control space.',
    profile: { s: 1, d: 1, k: 1, f: 1 },
    weight: 100, walk: 3.4, run: 7.2, airSpeed: 5.2, airAccel: 0.42, gravity: 0.62, fall: 12, jumpV: 14.5, hopV: 9, doubleJumpV: 13.5, jumps: 2,
    skins: [['#36b6ff', '#0a3a66'], ['#f4f6ff', '#5a6b8c'], ['#ff7a3c', '#5c2400'], ['#b06bff', '#2e0d5c']],
    moves: {
      nspecial: proj('Plasma Bolt', 30, { spawn: 12, speed: 11, life: 60, dmg: 6, base: 12, growth: 36, angle: 8, w: 36, h: 24, gravity: 0 }),
      sspecial: melee('Bolt Dash', 32, [hb(10, 20, 11, 52, 64, 32, 56, 0, 80, 60)], { recovery: { vx: 13, vy: -2 }, momentum: 0.8 }),
      uspecial: recov('Rising Spark', 34, [hb(4, 14, 9, 32, 58, 82, 0, -50, 86, 110)], { vx: 7, vy: -17.5 }),
      dspecial: counter('Reflect Field', 38, { start: 6, end: 20, mult: 1.3, base: 42, growth: 80, angle: 50 }),
    },
  },
  {
    id: 'blaze', name: 'BLAZE', tag: 'Speedster',
    blurb: 'Blistering speed and brutal combos, but light — one bad read and you fly.',
    profile: { s: 0.92, d: 0.92, k: 0.95, f: 0.86 },
    weight: 82, walk: 4.1, run: 9.4, airSpeed: 6.4, airAccel: 0.5, gravity: 0.74, fall: 14.5, jumpV: 15.5, hopV: 9.5, doubleJumpV: 14, jumps: 2,
    skins: [['#ff4655', '#5c0d16'], ['#2bd9ff', '#0a3a66'], ['#ffd23f', '#5c4200'], ['#1a1a22', '#000000']],
    moves: {
      nspecial: proj('Ember Blaster', 28, { spawn: 8, speed: 14, life: 44, dmg: 4, base: 6, growth: 16, angle: 4, w: 30, h: 16, gravity: 0 }),
      sspecial: melee('Flame Charge', 30, [hb(8, 22, 9, 46, 60, 40, 52, -6, 78, 70)], { recovery: { vx: 16, vy: -4 }, momentum: 1 }),
      uspecial: recov('Inferno Leap', 32, [hb(4, 13, 8, 28, 56, 84, 0, -46, 78, 108)], { vx: 9, vy: -19 }),
      dspecial: melee('Cinder Sweep', 26, [hb(6, 12, 7, 18, 48, 24, 50, 30, 70, 40)], {}),
    },
  },
  {
    id: 'titan', name: 'TITAN', tag: 'Heavyweight',
    blurb: 'Hits like a truck and survives forever. Slow startup — make it count.',
    profile: { s: 1.18, d: 1.22, k: 1.12, f: 1.2 },
    weight: 132, walk: 2.7, run: 5.6, airSpeed: 4.4, airAccel: 0.34, gravity: 0.56, fall: 11.5, jumpV: 13.5, hopV: 8.5, doubleJumpV: 12, jumps: 2,
    skins: [['#ffc234', '#6b4a00'], ['#6cff8a', '#0d5c27'], ['#ff5ea0', '#5c0d36'], ['#9aa6b2', '#2a2f36']],
    moves: {
      nspecial: melee('Quake Slam', 40, [hb(18, 24, 16, 30, 78, 80, 6, -20, 110, 80)], {}),
      sspecial: melee('Bull Rush', 40, [hb(12, 26, 15, 60, 70, 30, 64, 0, 96, 84)], { recovery: { vx: 14, vy: -3 }, momentum: 1, armor: { start: 6, end: 26 } }),
      uspecial: recov('Sky Hammer', 36, [hb(5, 16, 12, 34, 64, 86, 0, -54, 96, 120)], { vx: 6, vy: -16 }),
      dspecial: counter('Iron Wall', 44, { start: 8, end: 26, mult: 1.35, base: 48, growth: 84, angle: 40 }),
    },
  },
  {
    id: 'sprite', name: 'SPRITE', tag: 'Aerialist',
    blurb: 'Five jumps, drifting aerials, and tricky edgeguards. Fragile up close.',
    profile: { s: 0.96, d: 0.9, k: 0.9, f: 0.95 },
    weight: 74, walk: 3.0, run: 6.2, airSpeed: 6.0, airAccel: 0.56, gravity: 0.4, fall: 8.5, jumpV: 12.5, hopV: 8, doubleJumpV: 11, jumps: 5,
    skins: [['#6cff8a', '#0d5c27'], ['#ff2e7e', '#5c0d36'], ['#2bd9ff', '#0a3a66'], ['#ffe14d', '#5c4a00']],
    moves: {
      nspecial: proj('Spore Puff', 30, { spawn: 10, speed: 8, life: 70, dmg: 5, base: 10, growth: 28, angle: 14, w: 30, h: 30, gravity: 0.12 }),
      sspecial: melee('Glide Strike', 30, [hb(8, 18, 9, 44, 56, 38, 52, -8, 74, 66)], { recovery: { vx: 12, vy: -6 }, momentum: 0.9 }),
      uspecial: recov('Float Burst', 30, [hb(4, 14, 7, 26, 52, 84, 0, -48, 80, 104)], { vx: 8, vy: -16 }, false),
      dair: move('Down Air', 32, [hb(9, 17, 11, 14, 54, 280, 6, 56, 56, 76)], { kind: 'aerial', spike: true }),
      dspecial: melee('Pollen Burst', 28, [hb(8, 16, 8, 22, 50, 90, 0, -10, 96, 96)], {}),
    },
  },
  {
    id: 'frost', name: 'FROST', tag: 'Ice Zoner',
    blurb: 'Walls you out with ice shards and freezes pressure with a chilling counter.',
    profile: { s: 1.02, d: 1, k: 1, f: 1.05 },
    weight: 104, walk: 3.1, run: 6.0, airSpeed: 5.0, airAccel: 0.4, gravity: 0.6, fall: 11.5, jumpV: 13.8, hopV: 8.8, doubleJumpV: 13, jumps: 2,
    skins: [['#7ad7ff', '#13456b'], ['#c9b8ff', '#3a2a6b'], ['#e9f6ff', '#6a7e95'], ['#3effc9', '#0d5c4a']],
    moves: {
      nspecial: proj('Ice Shard', 30, { spawn: 10, speed: 9, life: 64, dmg: 5, base: 14, growth: 30, angle: 10, w: 28, h: 22, gravity: 0.04 }),
      sspecial: melee('Frost Slide', 30, [hb(8, 18, 10, 46, 56, 28, 54, 6, 78, 56)], { recovery: { vx: 13, vy: -2 }, momentum: 0.95 }),
      uspecial: recov('Blizzard Lift', 32, [hb(4, 16, 8, 26, 54, 84, 0, -48, 84, 110)], { vx: 6, vy: -17 }),
      dspecial: counter('Permafrost', 42, { start: 7, end: 24, mult: 1.4, base: 44, growth: 80, angle: 60 }),
    },
  },
  {
    id: 'bastion', name: 'BASTION', tag: 'Fortress',
    blurb: 'Plows through hits with super armor and turns offense back with a reflector.',
    profile: { s: 1.12, d: 1.15, k: 1.05, f: 1.18 },
    weight: 128, walk: 2.6, run: 5.2, airSpeed: 4.2, airAccel: 0.34, gravity: 0.58, fall: 11, jumpV: 13, hopV: 8, doubleJumpV: 11.5, jumps: 2,
    skins: [['#c9a24b', '#4a3a12'], ['#7fb2ff', '#1c3a66'], ['#ff7a7a', '#5c1a1a'], ['#9fe6b0', '#1f4a2c']],
    moves: {
      nspecial: melee('Hammer Charge', 42, [hb(16, 24, 17, 30, 80, 35, 70, 0, 96, 70)], { armor: { start: 4, end: 24 } }),
      sspecial: melee('Shield Bash', 36, [hb(10, 20, 13, 56, 64, 32, 60, -4, 84, 72)], { recovery: { vx: 12, vy: -3 }, momentum: 0.9, armor: { start: 6, end: 22 } }),
      uspecial: recov('Rocket Guard', 34, [hb(5, 16, 11, 32, 60, 86, 0, -52, 90, 116)], { vx: 6, vy: -16 }),
      dspecial: counter('Bulwark', 46, { start: 8, end: 28, mult: 1.45, base: 50, growth: 86, angle: 45 }),
    },
  },
  {
    id: 'raven', name: 'RAVEN', tag: 'Ninja',
    blurb: 'Shuriken pressure, teleport mobility, and lightning-fast frame data.',
    profile: { s: 0.9, d: 0.9, k: 0.92, f: 0.82 },
    weight: 80, walk: 4.0, run: 9.0, airSpeed: 6.2, airAccel: 0.5, gravity: 0.8, fall: 15, jumpV: 15, hopV: 9.5, doubleJumpV: 13.5, jumps: 2,
    skins: [['#5a5f78', '#15171f'], ['#ff3c6e', '#4a0d22'], ['#3effc9', '#0d5c4a'], ['#ffd23f', '#5c4200']],
    moves: {
      nspecial: proj('Shuriken', 26, { spawn: 6, speed: 15, life: 40, dmg: 4, base: 6, growth: 18, angle: 6, w: 26, h: 18, gravity: 0 }),
      sspecial: melee('Shadow Slash', 28, [hb(7, 14, 10, 46, 58, 36, 56, -4, 76, 62)], { recovery: { vx: 15, vy: -4 }, momentum: 1 }),
      uspecial: recov('Shadowstep', 24, [hb(2, 8, 6, 24, 50, 86, 0, -44, 70, 100)], { vx: 11, vy: -19 }, false),
      dspecial: counter('Smoke Veil', 38, { start: 5, end: 22, mult: 1.35, base: 40, growth: 82, angle: 50 }),
    },
  },
  {
    id: 'jolt', name: 'JOLT', tag: 'Brawler',
    blurb: 'Rapid electric pressure and a long tether grab to drag opponents in.',
    profile: { s: 0.98, d: 1, k: 1, f: 0.94 },
    weight: 98, walk: 3.6, run: 7.6, airSpeed: 5.4, airAccel: 0.46, gravity: 0.66, fall: 13, jumpV: 14.2, hopV: 9, doubleJumpV: 13, jumps: 2,
    skins: [['#ffe14d', '#5c4a00'], ['#2bd9ff', '#0a3a66'], ['#ff7a3c', '#5c2400'], ['#b06bff', '#2e0d5c']],
    moves: {
      nspecial: proj('Spark Burst', 26, { spawn: 8, speed: 12, life: 34, dmg: 5, base: 10, growth: 24, angle: 12, w: 30, h: 26, gravity: 0 }),
      sspecial: melee('Volt Tackle', 32, [hb(10, 20, 11, 50, 62, 34, 56, 0, 80, 64)], { recovery: { vx: 14, vy: -3 }, momentum: 1 }),
      uspecial: recov('Thunder Leap', 32, [hb(4, 14, 9, 30, 58, 84, 0, -50, 84, 110)], { vx: 8, vy: -18 }),
      grab: move('Tether Grab', 32, [], { kind: 'grab', range: 86, throwDmg: 8, throwBase: 56, throwGrowth: 60, throwAngle: 50 }),
      dspecial: melee('Ground Spark', 28, [hb(8, 16, 9, 24, 56, 88, 0, 24, 100, 50)], {}),
    },
  },
  {
    id: 'bramble', name: 'BRAMBLE', tag: 'Grappler',
    blurb: 'A heavy bruiser whose lunging command grab punishes shields and stalls.',
    profile: { s: 1.1, d: 1.18, k: 1.1, f: 1.16 },
    weight: 124, walk: 2.7, run: 5.4, airSpeed: 4.3, airAccel: 0.36, gravity: 0.6, fall: 11.5, jumpV: 13.2, hopV: 8, doubleJumpV: 11.5, jumps: 2,
    skins: [['#5fae4b', '#1f3a12'], ['#c97f4b', '#4a2a12'], ['#ff6f9f', '#5c0d36'], ['#7fd0ff', '#1c3a66']],
    moves: {
      nspecial: melee('Vine Whip', 36, [hb(12, 20, 12, 40, 64, 32, 84, -6, 110, 56)], {}),
      sspecial: move('Tangle Lunge', 34, [], { kind: 'grab', range: 96, throwDmg: 12, throwBase: 64, throwGrowth: 66, throwAngle: 60, recovery: { vx: 10, vy: -3 }, momentum: 0.8 }),
      uspecial: recov('Vine Pull', 34, [hb(5, 16, 10, 30, 58, 86, 0, -52, 86, 116)], { vx: 7, vy: -16 }),
      dspecial: melee('Root Stomp', 34, [hb(10, 18, 14, 30, 74, 88, 0, 26, 104, 56)], { armor: { start: 4, end: 18 } }),
    },
  },
  {
    id: 'zephyr', name: 'ZEPHYR', tag: 'Windrider',
    blurb: 'Triple-jumping aggressor who shoves foes off-stage with gusts and dives.',
    profile: { s: 0.98, d: 0.92, k: 0.9, f: 0.9 },
    weight: 78, walk: 3.4, run: 6.8, airSpeed: 6.6, airAccel: 0.56, gravity: 0.42, fall: 9, jumpV: 12.8, hopV: 8, doubleJumpV: 11.5, jumps: 3,
    skins: [['#8fe9ff', '#1c5a6b'], ['#ffffff', '#7e8fa5'], ['#a0ff7a', '#2c5c1f'], ['#ff9ad2', '#5c2a44']],
    moves: {
      nspecial: proj('Gust', 30, { spawn: 8, speed: 9, life: 40, dmg: 4, base: 18, growth: 22, angle: 14, w: 44, h: 36, gravity: 0 }),
      sspecial: melee('Air Dash', 28, [hb(7, 16, 9, 44, 54, 38, 54, -6, 78, 64)], { recovery: { vx: 15, vy: -5 }, momentum: 1 }),
      uspecial: recov('Cyclone', 32, [hb(4, 18, 9, 24, 52, 90, 0, -30, 100, 110)], { vx: 7, vy: -17 }, false),
      dspecial: melee('Dive Kick', 26, [hb(5, 16, 10, 16, 56, 280, 8, 40, 60, 76)], { recovery: { vx: 4, vy: 14 }, spike: true }),
    },
  },
  {
    id: 'magma', name: 'MAGMA', tag: 'Lava Zoner',
    blurb: 'Lobs arcing lava to cover ground, then erupts for monstrous launches.',
    profile: { s: 1.1, d: 1.2, k: 1.08, f: 1.14 },
    weight: 122, walk: 2.7, run: 5.4, airSpeed: 4.4, airAccel: 0.36, gravity: 0.6, fall: 11.5, jumpV: 13, hopV: 8, doubleJumpV: 11.5, jumps: 2,
    skins: [['#ff5a2e', '#5c1607'], ['#ffb02e', '#5c3a00'], ['#ff2e6b', '#5c0d22'], ['#6b6b78', '#1a1a22']],
    moves: {
      nspecial: proj('Lava Lob', 34, { spawn: 12, speed: 9, life: 80, dmg: 8, base: 16, growth: 40, angle: 50, w: 36, h: 36, gravity: 0.3 }),
      sspecial: melee('Magma Charge', 34, [hb(10, 22, 12, 50, 64, 34, 58, 0, 82, 72)], { recovery: { vx: 12, vy: -3 }, momentum: 0.9, armor: { start: 8, end: 22 } }),
      uspecial: recov('Eruption', 36, [hb(6, 18, 13, 34, 66, 86, 0, -54, 92, 120)], { vx: 5, vy: -16 }),
      dspecial: counter('Magma Shell', 44, { start: 8, end: 26, mult: 1.4, base: 48, growth: 84, angle: 55 }),
    },
  },
  {
    id: 'nova', name: 'NOVA', tag: 'Cosmic',
    blurb: 'A balanced star-knight with a piercing beam and a warping recovery.',
    profile: { s: 1.02, d: 1.02, k: 1.02, f: 1.02 },
    weight: 100, walk: 3.4, run: 7.0, airSpeed: 5.4, airAccel: 0.44, gravity: 0.6, fall: 12, jumpV: 14.2, hopV: 9, doubleJumpV: 13.2, jumps: 2,
    skins: [['#9a7bff', '#2e1a6b'], ['#2bd9ff', '#0a3a66'], ['#ffd23f', '#5c4200'], ['#ff6fae', '#5c0d36']],
    moves: {
      nspecial: proj('Star Beam', 32, { spawn: 12, speed: 16, life: 50, dmg: 9, base: 14, growth: 38, angle: 6, w: 48, h: 18, gravity: 0 }),
      sspecial: melee('Comet Dash', 32, [hb(9, 18, 11, 50, 62, 34, 56, 0, 80, 66)], { recovery: { vx: 14, vy: -3 }, momentum: 1 }),
      uspecial: recov('Warp Star', 30, [hb(3, 12, 8, 28, 56, 84, 0, -48, 80, 108)], { vx: 10, vy: -18 }, false),
      dspecial: counter('Gravity Well', 42, { start: 7, end: 24, mult: 1.35, base: 44, growth: 82, angle: 80 }),
    },
  },
  {
    id: 'kai', name: 'KAI', tag: 'Martial Artist',
    blurb: 'Explosive footsies and a knee that ends stocks. Lives for the read.',
    profile: { s: 1, d: 1.05, k: 1.08, f: 0.92 },
    weight: 96, walk: 3.8, run: 8.8, airSpeed: 5.6, airAccel: 0.48, gravity: 0.78, fall: 14.5, jumpV: 15, hopV: 9.5, doubleJumpV: 13.8, jumps: 2,
    skins: [['#ff8a3c', '#5c2607'], ['#3c6bff', '#0d1a5c'], ['#ffffff', '#6a4a2a'], ['#2effa0', '#0d5c3a']],
    moves: {
      fair: move('Knee', 30, [hb(8, 11, 16, 18, 86, 42, 56, -16, 56, 50)], { kind: 'aerial' }),
      nspecial: melee('Palm Blast', 28, [hb(8, 14, 9, 26, 56, 30, 60, -6, 70, 60)], {}),
      sspecial: melee('Flying Knee', 30, [hb(8, 16, 12, 48, 66, 42, 54, -10, 72, 68)], { recovery: { vx: 16, vy: -8 }, momentum: 1 }),
      uspecial: recov('Rising Fist', 30, [hb(3, 12, 11, 30, 64, 88, 0, -52, 74, 112)], { vx: 8, vy: -19 }),
      dspecial: counter('Iron Stance', 40, { start: 6, end: 22, mult: 1.45, base: 46, growth: 86, angle: 40 }),
    },
  },
  {
    id: 'pixel', name: 'PIXEL', tag: 'Trickster',
    blurb: 'A glitchy speed-demon that blinks around the stage and never sits still.',
    profile: { s: 0.94, d: 0.9, k: 0.9, f: 0.86 },
    weight: 84, walk: 3.8, run: 8.2, airSpeed: 6.0, airAccel: 0.5, gravity: 0.7, fall: 13.5, jumpV: 14.6, hopV: 9, doubleJumpV: 13, jumps: 2,
    skins: [['#2effd2', '#0d5c4a'], ['#ff2ec9', '#5c0d4a'], ['#ffe14d', '#5c4a00'], ['#7a8cff', '#1a225c']],
    moves: {
      nspecial: proj('Glitch Bolt', 26, { spawn: 7, speed: 13, life: 42, dmg: 5, base: 8, growth: 22, angle: 8, w: 28, h: 24, gravity: 0 }),
      sspecial: melee('Blink Dash', 24, [hb(4, 12, 9, 44, 54, 36, 56, -4, 74, 62)], { recovery: { vx: 17, vy: -3 }, momentum: 1 }),
      uspecial: recov('Warp Up', 24, [hb(2, 9, 6, 24, 50, 86, 0, -46, 72, 102)], { vx: 9, vy: -19 }, false),
      dspecial: melee('Decoy Strike', 30, [hb(8, 16, 8, 22, 52, 90, 0, -10, 96, 96)], {}),
    },
  },
  {
    id: 'onyx', name: 'ONYX', tag: 'Colossus',
    blurb: 'The slowest, heaviest, hardest-hitting fighter. Armored smashes, raw KO power.',
    profile: { s: 1.24, d: 1.3, k: 1.18, f: 1.28 },
    weight: 140, walk: 2.4, run: 4.8, airSpeed: 4.0, airAccel: 0.3, gravity: 0.54, fall: 11, jumpV: 12.8, hopV: 7.5, doubleJumpV: 11, jumps: 2,
    skins: [['#6b6f80', '#181a22'], ['#9a5cff', '#2a0d5c'], ['#ff5a3c', '#5c1607'], ['#3cd0ff', '#0d3a5c']],
    moves: {
      fsmash: move('Forward Smash', 46, [hb(15, 21, 24, 28, 96, 35, 86, 2, 100, 72)], { kind: 'ground', smash: true, armor: { start: 4, end: 14 } }),
      usmash: move('Up Smash', 44, [hb(14, 20, 22, 32, 96, 88, 8, -94, 86, 110)], { kind: 'ground', smash: true, armor: { start: 4, end: 13 } }),
      nspecial: proj('Boulder Lob', 38, { spawn: 14, speed: 8, life: 76, dmg: 11, base: 18, growth: 44, angle: 46, w: 42, h: 42, gravity: 0.28 }),
      sspecial: melee('Earthshaker', 44, [hb(14, 28, 18, 60, 74, 30, 70, 0, 100, 88)], { recovery: { vx: 12, vy: -3 }, momentum: 0.9, armor: { start: 6, end: 28 } }),
      uspecial: recov('Stone Rise', 38, [hb(6, 18, 14, 34, 66, 86, 0, -56, 96, 124)], { vx: 5, vy: -15.5 }),
      dspecial: counter('Bedrock', 48, { start: 9, end: 30, mult: 1.5, base: 52, growth: 88, angle: 40 }),
    },
  },
];

export const ROSTER = SPECS.map(makeChar);
export const getCharacter = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
export const getCharacterIndex = (id) => Math.max(0, ROSTER.findIndex((c) => c.id === id));
