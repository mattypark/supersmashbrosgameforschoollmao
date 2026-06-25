// The fighter: a feet-anchored entity driven entirely by a normalized
// InputState each tick. All decision-making (jab vs tilt vs smash vs aerial)
// lives here; hit resolution between fighters lives in match.js.

import {
  GRAVITY,
  MAX_FALL,
  FAST_FALL_MUL,
  GROUND_FRICTION,
  AIR_FRICTION,
  JUMPSQUAT,
  SHIELD_MAX,
  SHIELD_REGEN,
  SHIELD_DRAIN,
  SPOTDODGE_FRAMES,
  SPOTDODGE_INVULN,
  ROLL_FRAMES,
  ROLL_INVULN,
  ROLL_SPEED,
  AIRDODGE_FRAMES,
  AIRDODGE_INVULN,
  RESPAWN_FRAMES,
  RESPAWN_INVULN,
  SMASH_CHARGE_MAX,
  KB_DECAY,
  INPUT_BUFFER,
  HITSTUN_GRAV_MUL,
  LANDLAG_AERIAL,
  LANDLAG_FASTFALL,
} from './constants.js';
import { clamp, approach, sign } from '../engine/math.js';
import { FlickMemory } from '../engine/input.js';
import { getCharacter } from '../data/characters.js';
import { STAGE } from './stage.js';

const RUN_THRESHOLD = 0.66;
const LEDGE_REGRAB_LOCK = 26;
const LEDGE_HANG_INVULN = 40;

export function createFighter(index, charId, spawn, skinIndex = 0) {
  const def = getCharacter(charId);
  const skin = (def.skins && def.skins[skinIndex]) || [def.color, def.color2];
  const f = {
    index,
    charId,
    def,
    skin: skinIndex,
    color: skin[0],
    color2: skin[1],
    x: spawn.x,
    y: spawn.y,
    px: spawn.x,
    py: spawn.y,
    vx: 0,
    vy: 0,
    facing: spawn.x < 640 ? 1 : -1,
    grounded: false,
    jumpsUsed: 0,
    fastFalling: false,
    percent: 0,
    stocks: 0,
    state: 'air',
    stateFrame: 0,
    move: null,
    moveKey: null,
    actionLock: 0,
    jumpsquat: 0,
    dropThrough: 0,
    shieldHP: SHIELD_MAX,
    shieldBroken: 0,
    hitstun: 0,
    hitlag: 0,
    charge: 0,
    charging: false,
    counterUsed: false,
    helpless: false,
    invuln: 0,
    airdodged: false,
    ledge: null,
    ledgeRegrab: 0,
    respawnTimer: 0,
    dead: false,
    hitIds: new Set(),
    flick: new FlickMemory(),
    buffer: { attack: 99, special: 99, jump: 99, grab: 99 },
    // presentation hints
    hitFlash: 0,
    facingVisual: spawn.x < 640 ? 1 : -1,
    isCPU: false,
    lastHitBy: -1,
  };
  return f;
}

export function resetForStock(f, spawn) {
  f.x = spawn.x;
  f.y = spawn.y;
  f.vx = 0;
  f.vy = 0;
  f.percent = 0;
  f.facing = spawn.x < 640 ? 1 : -1;
  f.state = 'air';
  f.stateFrame = 0;
  f.move = null;
  f.actionLock = 0;
  f.hitstun = 0;
  f.hitlag = 0;
  f.charge = 0;
  f.charging = false;
  f.helpless = false;
  f.grounded = false;
  f.jumpsUsed = 0;
  f.airdodged = false;
  f.ledge = null;
  f.dead = false;
  f.respawnTimer = 0;
  f.invuln = RESPAWN_INVULN;
  f.hitIds.clear();
}

// --- Movement primitives -----------------------------------------------------

function applyGravity(f, input, mul = 1) {
  const g = (f.def.gravity ?? GRAVITY) * mul;
  const maxFall = f.def.fall ?? MAX_FALL;
  f.vy += g;
  let cap = maxFall;
  if (f.fastFalling) cap = maxFall * FAST_FALL_MUL;
  if (f.vy > cap) f.vy = cap;
}

function groundDrift(f, input, control = 1) {
  const mag = Math.abs(input.axisX);
  let target = 0;
  if (mag > 0.2) {
    const speed = mag > RUN_THRESHOLD ? f.def.run : f.def.walk;
    target = sign(input.axisX) * speed;
  }
  f.vx = approach(f.vx, target * control, (f.def.run ?? 7) * 0.25 + 0.6);
  if (Math.abs(target) < 0.01) f.vx *= GROUND_FRICTION;
}

function airDrift(f, input) {
  const target = clamp(input.axisX, -1, 1) * f.def.airSpeed;
  f.vx = approach(f.vx, target, f.def.airAccel);
  f.vx *= AIR_FRICTION ** 0.25;
}

function integrateAndCollide(f, input) {
  f.px = f.x;
  f.py = f.y;
  f.x += f.vx;
  f.y += f.vy;
  collideStage(f, input);
}

function landOn(f, surfaceY) {
  f.y = surfaceY;
  f.vy = 0;
  f.fastFalling = false;
  const wasAir =
    f.state === 'air' ||
    f.state === 'hitstun' ||
    f.state === 'helpless' ||
    (f.state === 'attack' && f.move && f.move.kind === 'aerial');
  f.grounded = true;
  f.jumpsUsed = 0;
  f.airdodged = false;
  f.helpless = false;
  if (wasAir) {
    if (f.state === 'attack' && f.move && f.move.kind === 'aerial') {
      f.actionLock = f.fastFalling ? LANDLAG_FASTFALL : LANDLAG_AERIAL;
    }
    if (f.state === 'hitstun') {
      // bounce a touch on hard landings for readability
      f.actionLock = Math.min(12, Math.round(f.hitstun * 0.3));
      f.hitstun = 0;
    }
    f.state = 'idle';
    f.move = null;
    f.stateFrame = 0;
  }
}

function collideStage(f, input) {
  const b = STAGE.ground;
  const feet = f.y;
  const feetPrev = f.py;
  let landed = false;

  // One-way platforms.
  if (f.dropThrough <= 0 && f.vy >= 0) {
    for (const p of STAGE.platforms) {
      if (
        feetPrev <= p.y + 2 &&
        feet >= p.y &&
        f.x > p.x - 6 &&
        f.x < p.x + p.w + 6
      ) {
        landOn(f, p.y);
        landed = true;
        break;
      }
    }
  }

  // Solid block — top surface.
  if (!landed && f.vy >= 0) {
    if (feetPrev <= b.y + 2 && feet >= b.y && f.x > b.x - 4 && f.x < b.x + b.w + 4) {
      landOn(f, b.y);
      landed = true;
    }
  }

  // Solid block — side walls (only when below the top lip).
  if (feet > b.y + 6 && feet - 96 < b.y + b.h) {
    const half = 22;
    if (f.x + half > b.x && f.x - half < b.x + b.w) {
      if (f.px <= b.x) {
        f.x = b.x - half;
        if (f.vx > 0) f.vx = 0;
      } else if (f.px >= b.x + b.w) {
        f.x = b.x + b.w + half;
        if (f.vx < 0) f.vx = 0;
      }
    }
  }

  // Walked off an edge -> become airborne.
  if (f.grounded && !landed) {
    const onPlat = STAGE.platforms.some(
      (p) => Math.abs(feet - p.y) < 3 && f.x > p.x - 6 && f.x < p.x + p.w + 6,
    );
    const onBlock = Math.abs(feet - b.y) < 3 && f.x > b.x - 4 && f.x < b.x + b.w + 4;
    if (!onPlat && !onBlock) {
      f.grounded = false;
      if (f.state === 'idle' || f.state === 'shield') f.state = 'air';
    }
  }
}

// --- Ledges ------------------------------------------------------------------

function tryGrabLedge(f, input) {
  if (f.ledgeRegrab > 0 || f.vy < -1.5) return false;
  for (const lg of STAGE.ledges) {
    const onAirSide = lg.dir < 0 ? f.x < lg.x : f.x > lg.x;
    const nearX = Math.abs(f.x - lg.x) < 52 && onAirSide;
    const nearY = f.y > lg.y - 18 && f.y < lg.y + 120;
    const towardOrNeutral = lg.dir < 0 ? input.axisX > -0.5 : input.axisX < 0.5;
    if (nearX && nearY && towardOrNeutral) {
      f.ledge = lg;
      f.state = 'ledge';
      f.stateFrame = 0;
      f.vx = 0;
      f.vy = 0;
      f.x = lg.x + lg.dir * 24;
      f.y = lg.y + 78;
      f.facing = -lg.dir;
      f.jumpsUsed = 0;
      f.airdodged = false;
      f.invuln = Math.max(f.invuln, LEDGE_HANG_INVULN);
      return true;
    }
  }
  return false;
}

function updateLedge(f, input) {
  f.stateFrame++;
  const lg = f.ledge;
  const climb = input.jumpPressed || input.up || (lg.dir < 0 ? input.right : input.left);
  const drop = input.down || (lg.dir < 0 ? input.left : input.right);
  if (f.stateFrame < 6) return; // brief settle so inputs don't fire instantly
  if (climb) {
    // hop onto the stage
    f.x = lg.x + lg.dir * -34;
    f.y = lg.y - 2;
    f.state = 'idle';
    f.grounded = true;
    f.ledge = null;
    f.vy = 0;
    f.invuln = Math.max(f.invuln, 18);
  } else if (drop && f.stateFrame > 8) {
    f.state = 'air';
    f.ledge = null;
    f.ledgeRegrab = LEDGE_REGRAB_LOCK;
    f.vy = 1;
  }
}

// --- Action resolution -------------------------------------------------------

function pickGroundAttack(f, input) {
  const smashDir = f.flick.smashDir();
  if (smashDir === 'up') return { key: 'usmash', smash: true };
  if (smashDir === 'down') return { key: 'dsmash', smash: true };
  if (smashDir === 'left' || smashDir === 'right') {
    f.facing = smashDir === 'left' ? -1 : 1;
    return { key: 'fsmash', smash: true };
  }
  const running = Math.abs(f.vx) > f.def.walk + 1.2;
  if (running && !input.down) return { key: 'dash' };
  if (input.up) return { key: 'utilt' };
  if (input.down) return { key: 'dtilt' };
  if (input.left || input.right) {
    f.facing = input.left ? -1 : 1;
    return { key: 'ftilt' };
  }
  return { key: 'jab' };
}

function pickAerial(f, input) {
  if (input.up) return 'uair';
  if (input.down) return 'dair';
  if (input.left || input.right) {
    const forward = input.right ? 1 : -1;
    return forward === f.facing ? 'fair' : 'bair';
  }
  return 'nair';
}

function pickSpecial(f, input) {
  if (input.up) return 'uspecial';
  if (input.down) return 'dspecial';
  if (input.left || input.right) {
    f.facing = input.left ? -1 : 1;
    return 'sspecial';
  }
  return 'nspecial';
}

function startMove(f, key) {
  const mv = f.def.moves[key];
  if (!mv) return;
  f.state = 'attack';
  f.move = mv;
  f.moveKey = key;
  f.stateFrame = 0;
  f.hitIds.clear();
  f.charge = 0;
  f.charging = !!mv.smash;
  f.counterUsed = false;
  // Self-velocity for momentum moves / recoveries.
  if (mv.recovery && (key === 'uspecial' || key === 'sspecial')) {
    f.vx = f.facing * mv.recovery.vx;
    f.vy = mv.recovery.vy;
    if (key === 'uspecial') {
      f.jumpsUsed = 0;
      if (mv.helpless) f.pendingHelpless = true;
    }
  } else if (mv.momentum) {
    f.vx = f.facing * (f.def.run ?? 7) * mv.momentum;
  }
}

// Returns true if an action started this frame. Presses are buffered so they
// fire the instant the fighter becomes free.
function tryStartActions(f, input, ctx) {
  if (f.actionLock > 0) return false;

  const bAttack = input.attackPressed || f.buffer.attack <= INPUT_BUFFER;
  const bSpecial = input.specialPressed || f.buffer.special <= INPUT_BUFFER;
  const bJump = input.jumpPressed || f.buffer.jump <= INPUT_BUFFER;
  const bGrab = input.grabPressed || f.buffer.grab <= INPUT_BUFFER;
  const consume = (k) => {
    f.buffer[k] = 99;
  };

  // Shield / dodge / grab while grounded.
  if (f.grounded) {
    if (input.shieldHeld && f.shieldBroken <= 0) {
      // roll / spotdodge out of shield-press with a direction
      if (input.flickX || input.left || input.right) {
        startDodge(f, input.right || input.flickX > 0 ? 1 : -1);
        return true;
      }
      if (input.down) {
        startDodge(f, 0);
        return true;
      }
      f.state = 'shield';
      return true;
    }
    if (bGrab) {
      consume('grab');
      startMove(f, 'grab');
      return true;
    }
    if (bJump) {
      consume('jump');
      f.jumpsquat = JUMPSQUAT;
      return true;
    }
    if (bAttack) {
      consume('attack');
      const pick = pickGroundAttack(f, input);
      startMove(f, pick.key);
      return true;
    }
    if (bSpecial) {
      consume('special');
      startMove(f, pickSpecial(f, input));
      return true;
    }
    return false;
  }

  // Airborne options.
  if (bJump && f.jumpsUsed < f.def.jumps - 1) {
    consume('jump');
    f.jumpsUsed++;
    f.vy = -f.def.doubleJumpV;
    if (Math.abs(input.axisX) > 0.3) f.facing = sign(input.axisX);
    return true;
  }
  if (bAttack) {
    consume('attack');
    startMove(f, pickAerial(f, input));
    return true;
  }
  if (bSpecial) {
    consume('special');
    startMove(f, pickSpecial(f, input));
    return true;
  }
  if (input.shieldHeld && !f.airdodged) {
    startAirdodge(f, input);
    return true;
  }
  return false;
}

function startDodge(f, dir) {
  f.state = 'dodge';
  f.stateFrame = 0;
  if (dir === 0) {
    f.dodgeKind = 'spot';
    f.vx = 0;
  } else {
    f.dodgeKind = 'roll';
    f.facing = -dir; // roll faces the way you came, like Smash
    f.vx = dir * ROLL_SPEED;
  }
}

function startAirdodge(f, input) {
  f.state = 'dodge';
  f.dodgeKind = 'air';
  f.stateFrame = 0;
  f.airdodged = true;
  const mag = Math.hypot(input.axisX, input.axisY);
  if (mag > 0.3) {
    f.vx = (input.axisX / mag) * 9;
    f.vy = (input.axisY / mag) * 9;
  } else {
    f.vx *= 0.4;
    f.vy = 0;
  }
}

function updateDodge(f, input) {
  f.stateFrame++;
  const kind = f.dodgeKind;
  if (kind === 'spot') {
    f.invuln = inWindow(f.stateFrame, SPOTDODGE_INVULN) ? 2 : f.invuln;
    if (f.stateFrame >= SPOTDODGE_FRAMES) endState(f);
  } else if (kind === 'roll') {
    f.invuln = inWindow(f.stateFrame, ROLL_INVULN) ? 2 : f.invuln;
    f.vx *= 0.9;
    integrateAndCollide(f, input);
    if (f.stateFrame >= ROLL_FRAMES) endState(f);
  } else {
    // airdodge
    f.invuln = inWindow(f.stateFrame, AIRDODGE_INVULN) ? 2 : f.invuln;
    f.vx *= 0.92;
    f.vy *= 0.9;
    applyGravity(f, input);
    if (tryGrabLedge(f, input)) return;
    integrateAndCollide(f, input);
    if (f.stateFrame >= AIRDODGE_FRAMES) {
      f.state = f.grounded ? 'idle' : 'air';
    }
  }
}

const inWindow = (frame, [a, b]) => frame >= a && frame <= b;

function endState(f) {
  f.state = f.grounded ? 'idle' : 'air';
  f.move = null;
  f.stateFrame = 0;
}

// --- Attack update (with charge + projectiles + recovery) --------------------

function updateAttack(f, input, ctx) {
  const mv = f.move;

  // Smash charging: hold attack during startup to build power.
  if (f.charging) {
    const firstHit = mv.hitboxes[0]?.start ?? 99;
    if (f.stateFrame >= firstHit - 1) {
      if (input.attackHeld && f.charge < SMASH_CHARGE_MAX) {
        f.charge++;
        // freeze a frame before the hit comes out
        applyMoveMovement(f, input);
        return;
      }
      f.charging = false;
    }
  }

  f.stateFrame++;

  // Spawn projectile on its frame.
  if (mv.projectile && f.stateFrame === mv.projectile.spawn && ctx?.spawnProjectile) {
    ctx.spawnProjectile(f, mv.projectile);
    if (ctx.sfx) ctx.sfx('shoot', f);
  }

  applyMoveMovement(f, input);

  if (f.stateFrame >= mv.total) {
    if (f.pendingHelpless) {
      f.pendingHelpless = false;
      if (!f.grounded) {
        f.state = 'helpless';
        f.move = null;
        f.stateFrame = 0;
        return;
      }
    }
    endState(f);
  }
}

function applyMoveMovement(f, input) {
  if (f.grounded) {
    f.vx *= 0.86;
    f.grounded && collideStage(f, input);
  } else {
    applyGravity(f, input);
    // limited air drift during aerials
    if (f.move && f.move.kind === 'aerial') {
      f.vx = approach(f.vx, clamp(input.axisX, -1, 1) * f.def.airSpeed, f.def.airAccel * 0.6);
    }
  }
  integrateAndCollide(f, input);
}

// --- Hitstun -----------------------------------------------------------------

function updateHitstun(f, input) {
  f.hitstun--;
  // launch velocity bleeds off; gravity is softened mid-launch for cleaner combos
  f.vx *= 1 - KB_DECAY;
  applyGravity(f, input, HITSTUN_GRAV_MUL);
  if (!f.grounded) tryGrabLedge(f, input);
  integrateAndCollide(f, input);
  if (f.hitstun <= 0) {
    f.state = f.grounded ? 'idle' : 'air';
  }
}

// --- Main per-tick update ----------------------------------------------------

export function updateFighter(f, input, ctx) {
  // Hitlag freezes everything (the impact "pop").
  if (f.hitlag > 0) {
    f.hitlag--;
    if (f.hitFlash > 0) f.hitFlash--;
    return;
  }

  if (f.hitFlash > 0) f.hitFlash--;
  if (f.invuln > 0) f.invuln--;
  if (f.ledgeRegrab > 0) f.ledgeRegrab--;
  if (f.dropThrough > 0) f.dropThrough--;
  if (f.actionLock > 0) f.actionLock--;
  if (f.shieldBroken > 0) f.shieldBroken--;

  // Smooth visual facing.
  f.facingVisual = approach(f.facingVisual, f.facing, 0.34);

  f.flick.update(input);

  // Input buffering: a press stays "live" for a few frames so attacks, jumps,
  // and grabs come out the instant the fighter is free (out of lag / on landing).
  f.buffer.attack = input.attackPressed ? 0 : f.buffer.attack + 1;
  f.buffer.special = input.specialPressed ? 0 : f.buffer.special + 1;
  f.buffer.jump = input.jumpPressed ? 0 : f.buffer.jump + 1;
  f.buffer.grab = input.grabPressed ? 0 : f.buffer.grab + 1;

  if (f.dead) {
    f.respawnTimer--;
    if (f.respawnTimer <= 0 && ctx?.requestRespawn) ctx.requestRespawn(f);
    return;
  }

  // Shield bookkeeping.
  if (f.state === 'shield') {
    f.shieldHP = Math.max(0, f.shieldHP - SHIELD_DRAIN);
    if (f.shieldHP <= 0) {
      f.shieldBroken = 120;
      f.state = 'air';
      f.vy = -8;
    }
  } else if (f.shieldHP < SHIELD_MAX) {
    f.shieldHP = Math.min(SHIELD_MAX, f.shieldHP + SHIELD_REGEN);
  }

  switch (f.state) {
    case 'ledge':
      updateLedge(f, input);
      return;
    case 'dodge':
      updateDodge(f, input, ctx);
      return;
    case 'hitstun':
      updateHitstun(f, input);
      return;
    case 'attack':
      // allow a fastfall during aerials
      maybeFastfall(f, input);
      updateAttack(f, input, ctx);
      return;
    case 'shield':
      updateShield(f, input, ctx);
      return;
    case 'helpless':
      updateHelpless(f, input);
      return;
    default:
      updateActionable(f, input, ctx);
  }
}

function maybeFastfall(f, input) {
  if (!f.grounded && f.vy > 0.5 && input.axisY > 0.7 && !f.fastFalling) {
    f.fastFalling = true;
  }
}

function updateShield(f, input, ctx) {
  if (!input.shieldHeld) {
    f.state = 'idle';
    return;
  }
  // shield actions
  tryStartActions(f, input, ctx);
}

function updateHelpless(f, input) {
  applyGravity(f, input);
  f.vx = approach(f.vx, clamp(input.axisX, -1, 1) * f.def.airSpeed * 0.7, f.def.airAccel * 0.5);
  if (!f.grounded) tryGrabLedge(f, input);
  integrateAndCollide(f, input);
  if (f.grounded) f.state = 'idle';
}

function updateActionable(f, input, ctx) {
  // Jumpsquat -> leap.
  if (f.jumpsquat > 0) {
    f.jumpsquat--;
    if (f.jumpsquat === 0) {
      f.grounded = false;
      f.state = 'air';
      f.vy = input.jumpHeld ? -f.def.jumpV : -f.def.hopV;
      f.jumpsUsed = 1;
      if (Math.abs(input.axisX) > 0.3) f.vx += sign(input.axisX) * 2;
    }
    return;
  }

  // Try to begin an action; if one started, that state takes over next tick.
  if (tryStartActions(f, input, ctx)) {
    // dodges/jumpsquat handle their own movement; attacks start next frame
    if (f.state === 'attack' || f.state === 'dodge' || f.state === 'shield') return;
  }

  // Facing follows movement when actionable.
  if (Math.abs(input.axisX) > 0.2 && f.grounded) f.facing = sign(input.axisX);

  // Drop through one-way platforms.
  if (f.grounded && input.down && input.jumpPressed) {
    f.dropThrough = 8;
    f.grounded = false;
    f.y += 4;
    f.state = 'air';
  }

  if (f.grounded) {
    groundDrift(f, input);
  } else {
    maybeFastfall(f, input);
    applyGravity(f, input);
    airDrift(f, input);
    if (tryGrabLedge(f, input)) return;
  }
  integrateAndCollide(f, input);

  if (!f.grounded && f.state === 'idle') f.state = 'air';
  if (f.grounded && f.state === 'air') f.state = 'idle';
}
