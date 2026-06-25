// Core simulation constants. All units are in "world pixels" and frames.
// The sim runs at a FIXED timestep so physics stay deterministic.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Stage / camera. The world is wider/taller than the visible play area so that
// blast zones sit comfortably off-screen.
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

// Blast zones — cross any of these and you are KO'd.
export const BLAST = {
  left: -260,
  right: STAGE_WIDTH + 260,
  top: -300,
  bottom: STAGE_HEIGHT + 240,
};

// --- Knockback model (SmashWiki formula, tuned for feel) ---------------------
// KB = ((((p/10 + p*d/20) * (200/(w+100)) * 1.4) + 18) * s + b)
//   p = victim percent (after damage), d = move damage, w = weight,
//   s = knockback growth / 100, b = base knockback.
export const KB_DAMAGE_RATIO = 1.4; // the "1.4" term
export const KB_LAUNCH_SPEED = 0.062; // KB units -> px/frame launch velocity
export const KB_DECAY = 0.0058; // launch velocity bleed per frame
export const HITSTUN_PER_KB = 0.4; // frames of hitstun per KB unit
export const DI_MAX_RADIANS = (18 * Math.PI) / 180; // ±18° directional influence

// --- Movement defaults (characters override most of these) -------------------
export const GRAVITY = 0.62;
export const MAX_FALL = 13;
export const FAST_FALL_MUL = 1.6;
export const AIR_FRICTION = 0.94;
export const GROUND_FRICTION = 0.78;

// --- Timing windows ----------------------------------------------------------
export const SMASH_FLICK_WINDOW = 8; // frames: dir press -> attack = smash
export const INPUT_BUFFER = 7; // frames an attack/jump/grab press stays "live"
export const HITSTUN_GRAV_MUL = 0.6; // softer gravity mid-launch = cleaner combos
export const LANDLAG_AERIAL = 8; // landing lag after an aerial
export const LANDLAG_FASTFALL = 4; // reduced lag if you fast-fell into the ground
export const JUMPSQUAT = 4; // frames crouched before a jump leaves the ground
export const DASH_TURN_WINDOW = 6; // frames to re-dash the other way
export const SHIELD_MAX = 100;
export const SHIELD_REGEN = 0.32; // per frame when not shielding
export const SHIELD_DRAIN = 0.18; // passive drain per frame while shielding
export const SHIELD_HIT_DRAIN = 0.7; // extra drain per damage point blocked
export const SHIELDSTUN_PER_DMG = 0.8;
export const SPOTDODGE_FRAMES = 22;
export const SPOTDODGE_INVULN = [3, 17];
export const ROLL_FRAMES = 28;
export const ROLL_INVULN = [4, 18];
export const ROLL_SPEED = 9.5;
export const AIRDODGE_FRAMES = 30;
export const AIRDODGE_INVULN = [3, 24];
export const RESPAWN_FRAMES = 70;
export const RESPAWN_INVULN = 110;

// Charge for smash attacks: hold attack to build up, scaling damage + KB.
export const SMASH_CHARGE_MAX = 60; // frames
export const SMASH_CHARGE_BONUS = 0.9; // up to +90% at full charge

// Super armor: while an armored move is active, incoming hits whose knockback is
// below this threshold deal damage but no launch/hitstun. Strong hits break it.
export const ARMOR_THRESHOLD = 68;

// Hitlag (freeze frames) make impacts read. Scales with damage.
export const HITLAG_BASE = 4;
export const HITLAG_PER_DMG = 0.45;
export const HITLAG_MAX = 22;

export const DEFAULT_STOCKS = 3;
