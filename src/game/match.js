// Match: the authoritative simulation. Owns fighters + projectiles, resolves
// every hitbox/hurtbox interaction with the knockback formula, tracks stocks,
// KOs, hitlag, screen shake, and decides the winner. Fully deterministic given
// the same input stream — which is what keeps the door open to netcode.

import { BLAST, DEFAULT_STOCKS, SHIELD_HIT_DRAIN, SHIELDSTUN_PER_DMG, SMASH_CHARGE_MAX, SMASH_CHARGE_BONUS, ARMOR_THRESHOLD } from './constants.js';
import { createFighter, resetForStock, updateFighter } from './fighter.js';
import { knockback, hitstun, launchVelocity, hitlagFrames } from './knockback.js';
import { hurtbox, activeHitboxes, worldHitbox, boxesOverlap } from './hitbox.js';
import { STAGE } from './stage.js';

export function createMatch(config) {
  const stocks = config.stocks ?? DEFAULT_STOCKS;
  const fighters = config.players.map((p, i) => {
    const spawn = STAGE.spawns[i % STAGE.spawns.length];
    const f = createFighter(i, p.charId, spawn, p.skin || 0);
    f.stocks = stocks;
    f.isCPU = p.type === 'cpu';
    f.playerType = p.type;
    f.invuln = 60;
    return f;
  });

  return {
    fighters,
    projectiles: [],
    events: [],
    shake: 0,
    frame: 0,
    over: false,
    winner: null,
    startStocks: stocks,
    config,
  };
}

function chargeMul(f) {
  if (!f.move || !f.move.smash) return 1;
  return 1 + (f.charge / SMASH_CHARGE_MAX) * SMASH_CHARGE_BONUS;
}

function emit(match, ev) {
  match.events.push(ev);
}

// Apply a clean hit from attacker -> victim using hitbox data.
function applyHit(match, attacker, victim, data, victimInput, contact) {
  const mul = chargeMul(attacker);
  const dmg = data.dmg * mul;

  // Shield block: drains shield, no knockback, brief shieldstun + pushback.
  if (victim.state === 'shield' && victim.invuln <= 0) {
    victim.shieldHP -= dmg * SHIELD_HIT_DRAIN;
    victim.actionLock = Math.round(dmg * SHIELDSTUN_PER_DMG);
    victim.vx += attacker.facing * (1.5 + dmg * 0.12);
    attacker.hitlag = hitlagFrames(dmg);
    victim.hitlag = attacker.hitlag;
    emit(match, { type: 'shieldhit', x: contact.x, y: contact.y, color: victim.color });
    if (match.onSfx) match.onSfx('shield', attacker);
    if (victim.shieldHP <= 0) {
      victim.shieldBroken = 130;
      victim.state = 'air';
      victim.vy = -9;
    }
    return;
  }

  // Counter: an active counter move negates this hit and strikes the attacker.
  const cm = victim.move && victim.move.counter;
  if (
    victim.state === 'attack' &&
    cm &&
    !victim.counterUsed &&
    victim.stateFrame >= cm.start &&
    victim.stateFrame <= cm.end
  ) {
    victim.counterUsed = true;
    victim.facing = attacker.x < victim.x ? -1 : 1;
    const cdmg = cm.dmg || dmg * (cm.mult || 1.3);
    attacker.percent = Math.min(999, attacker.percent + cdmg);
    const ckb = knockback({
      percent: attacker.percent,
      damage: cdmg,
      weight: attacker.def.weight,
      base: cm.base || 40,
      growth: cm.growth || 80,
    });
    const cl = launchVelocity({ kb: ckb, angleDeg: cm.angle || 45, facing: victim.facing, diX: 0, diY: 0 });
    attacker.vx = cl.vx;
    attacker.vy = cl.vy;
    attacker.state = 'hitstun';
    attacker.move = null;
    attacker.hitstun = Math.max(8, hitstun(ckb));
    if (cl.vy < -0.5 || ckb > 40) attacker.grounded = false;
    attacker.lastHitBy = victim.index;
    const clag = hitlagFrames(cdmg);
    attacker.hitlag = clag;
    victim.hitlag = clag;
    attacker.hitFlash = clag + 6;
    match.shake = Math.min(28, match.shake + 6 + ckb * 0.16);
    emit(match, { type: 'spark', x: attacker.x, y: attacker.y - 50, power: ckb, color: victim.color, spike: false });
    if (match.onSfx) match.onSfx('hitBig', victim);
    return;
  }

  // Super armor: weak hits are absorbed (damage only) during armored frames.
  const am = victim.move && victim.move.armor;
  if (victim.state === 'attack' && am && victim.stateFrame >= am.start && victim.stateFrame <= am.end) {
    const testKb = knockback({
      percent: victim.percent + dmg,
      damage: dmg,
      weight: victim.def.weight,
      base: data.base,
      growth: data.growth * mul,
    });
    if (testKb < ARMOR_THRESHOLD) {
      victim.percent = Math.min(999, victim.percent + dmg);
      victim.hitFlash = 8;
      const alag = hitlagFrames(dmg);
      attacker.hitlag = alag;
      victim.hitlag = alag;
      match.shake = Math.min(20, match.shake + 2);
      emit(match, { type: 'spark', x: contact.x, y: contact.y, power: 14, color: '#dfe6ff', small: true });
      if (match.onSfx) match.onSfx('shield', attacker);
      return;
    }
  }

  victim.percent = Math.min(999, victim.percent + dmg);
  const growth = data.growth * mul;
  const kb = knockback({
    percent: victim.percent,
    damage: dmg,
    weight: victim.def.weight,
    base: data.base,
    growth,
  });
  const stun = Math.max(6, hitstun(kb));
  const launch = launchVelocity({
    kb,
    angleDeg: data.angle,
    facing: attacker.facing,
    diX: victimInput ? victimInput.axisX : 0,
    diY: victimInput ? victimInput.axisY : 0,
  });

  victim.vx = launch.vx;
  victim.vy = launch.vy;
  victim.state = 'hitstun';
  victim.move = null;
  victim.hitstun = stun;
  victim.fastFalling = false;
  if (launch.vy < -0.5 || kb > 40) victim.grounded = false;
  victim.lastHitBy = attacker.index;

  const lag = hitlagFrames(dmg);
  attacker.hitlag = lag;
  victim.hitlag = lag;
  victim.hitFlash = lag + 6;

  match.shake = Math.min(26, match.shake + 3 + kb * 0.16);
  emit(match, {
    type: 'spark',
    x: contact.x,
    y: contact.y,
    power: kb,
    color: attacker.color,
    spike: !!data.spike || (data.angle > 250 && data.angle < 290),
  });
  if (match.onSfx) match.onSfx(kb > 80 ? 'hitBig' : 'hit', attacker);
}

function resolveCombat(match, inputs) {
  const fs = match.fighters;
  for (const atk of fs) {
    if (atk.dead || atk.hitlag > 0) continue;

    // Grabs: a short-range capture that beats shields.
    if (atk.state === 'attack' && atk.move && atk.move.kind === 'grab') {
      const mv = atk.move;
      const active = atk.stateFrame >= Math.round(mv.total * 0.27) && atk.stateFrame <= Math.round(mv.total * 0.5);
      if (active && !atk.hitIds.has('grab')) {
        const gb = {
          x: atk.x + (atk.facing > 0 ? 0 : -mv.range),
          y: atk.y - 92,
          w: mv.range,
          h: 92,
        };
        for (const o of fs) {
          if (o === atk || o.dead || o.invuln > 0 || o.state === 'hitstun') continue;
          if (boxesOverlap(gb, hurtbox(o))) {
            // directional throw based on the grabber's stick
            const ai = inputs[atk.index] || {};
            let tAngle = mv.throwAngle;
            let tBase = mv.throwBase;
            let tGrowth = mv.throwGrowth;
            let face = atk.facing;
            if (ai.up) {
              tAngle = 88;
              tBase = mv.throwBase + 6;
            } else if (ai.down) {
              tAngle = 76;
              tBase = 26;
              tGrowth = mv.throwGrowth + 10;
            } else if ((ai.left && atk.facing > 0) || (ai.right && atk.facing < 0)) {
              face = -atk.facing; // back throw
              tAngle = 40;
              tBase = mv.throwBase + 10;
            }
            const saved = atk.facing;
            atk.facing = face;
            o.state = 'idle'; // throws ignore shield
            applyHit(
              match,
              atk,
              o,
              { dmg: mv.throwDmg, base: tBase, growth: tGrowth, angle: tAngle, spike: false },
              inputs[o.index],
              { x: o.x, y: o.y - 50 },
            );
            atk.facing = saved;
            atk.hitIds.add('grab');
            break;
          }
        }
      }
      continue;
    }

    const boxes = activeHitboxes(atk);
    if (!boxes.length) continue;
    for (const o of fs) {
      if (o === atk || o.dead || o.invuln > 0) continue;
      const hb = hurtbox(o);
      for (const { box, data } of boxes) {
        // one hit per (victim, hitbox) — distinct hitboxes can multi-hit
        const key = o.index + ':' + data.start;
        if (atk.hitIds.has(key)) continue;
        if (boxesOverlap(box, hb)) {
          applyHit(match, atk, o, data, inputs[o.index], {
            x: (box.x + box.w / 2 + hb.x + hb.w / 2) / 2,
            y: (box.y + box.h / 2 + hb.y + hb.h / 2) / 2,
          });
          atk.hitIds.add(key);
          break;
        }
      }
    }
  }
}

function spawnProjectile(match, owner, spec) {
  match.projectiles.push({
    owner: owner.index,
    color: owner.color,
    x: owner.x + owner.facing * 30,
    y: owner.y - 56,
    vx: owner.facing * spec.speed,
    vy: 0,
    facing: owner.facing,
    life: spec.life,
    spec,
  });
}

function updateProjectiles(match, inputs) {
  const fs = match.fighters;
  const b = STAGE.ground;
  match.projectiles = match.projectiles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.spec.gravity || 0;
    p.life--;
    if (p.life <= 0) return false;
    if (p.x < BLAST.left || p.x > BLAST.right || p.y > BLAST.bottom) return false;
    // hit solid block
    if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
      emit(match, { type: 'spark', x: p.x, y: p.y, power: 10, color: p.color, small: true });
      return false;
    }
    for (const o of fs) {
      if (o.index === p.owner || o.dead || o.invuln > 0) continue;
      const box = { x: p.x - p.spec.w / 2, y: p.y - p.spec.h / 2, w: p.spec.w, h: p.spec.h };
      if (boxesOverlap(box, hurtbox(o))) {
        const atk = fs[p.owner];
        const savedFacing = atk.facing;
        atk.facing = p.facing;
        applyHit(
          match,
          atk,
          o,
          { dmg: p.spec.dmg, base: p.spec.base, growth: p.spec.growth, angle: p.spec.angle, spike: false },
          inputs[o.index],
          { x: p.x, y: p.y },
        );
        atk.facing = savedFacing;
        atk.hitlag = 0; // shooter doesn't freeze on a projectile connect
        return false;
      }
    }
    return true;
  });
}

function checkKOs(match) {
  for (const f of match.fighters) {
    if (f.dead) continue;
    if (f.x < BLAST.left || f.x > BLAST.right || f.y < BLAST.top || f.y > BLAST.bottom) {
      f.stocks -= 1;
      match.shake = 30;
      emit(match, { type: 'blast', x: clampToView(f.x), y: clampToView(f.y, true), color: f.color });
      if (match.onSfx) match.onSfx('ko', f);
      if (f.stocks > 0) {
        f.dead = true;
        f.respawnTimer = 64;
        f.x = -9999; // park off-field until respawn
      } else {
        f.dead = true;
        f.eliminated = true;
        f.respawnTimer = Infinity;
        f.x = -9999;
      }
    }
  }
}

const clampToView = (v, vert = false) => {
  const lo = vert ? 30 : 30;
  const hi = vert ? 690 : 1250;
  return Math.max(lo, Math.min(hi, v));
};

function respawn(match, f) {
  const spawn = STAGE.spawns[f.index % STAGE.spawns.length];
  resetForStock(f, { x: spawn.x, y: 120 });
}

function checkWinner(match) {
  const alive = match.fighters.filter((f) => !f.eliminated);
  if (alive.length <= 1 && match.fighters.length > 1) {
    match.over = true;
    match.winner = alive[0] || null;
  }
}

// Advance one fixed tick. `inputs` is an array of InputState, one per fighter.
export function stepMatch(match, inputs) {
  if (match.over) return;
  match.events.length = 0;
  match.frame++;

  const ctx = {
    spawnProjectile: (owner, spec) => spawnProjectile(match, owner, spec),
    requestRespawn: (f) => respawn(match, f),
    sfx: (name, f) => match.onSfx && match.onSfx(name, f),
  };

  for (const f of match.fighters) {
    updateFighter(f, inputs[f.index], ctx);
  }

  resolveCombat(match, inputs);
  updateProjectiles(match, inputs);
  checkKOs(match);
  checkWinner(match);

  if (match.shake > 0) match.shake *= 0.86;
  if (match.shake < 0.2) match.shake = 0;
}
