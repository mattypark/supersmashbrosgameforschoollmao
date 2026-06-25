// Compact match-state codec shared by the client and the authoritative server.
// The server runs the real sim and ships these snapshots; the client rebuilds
// lightweight fighter objects the existing renderer/HUD can draw directly.

import { getCharacter } from '../data/characters.js';

export function serializeMatch(match) {
  return {
    f: match.fighters.map((f) => ({
      i: f.index,
      c: f.charId,
      co: f.color,
      c2: f.color2,
      x: Math.round(f.x * 10) / 10,
      y: Math.round(f.y * 10) / 10,
      fc: f.facing,
      fv: Math.round(f.facingVisual * 100) / 100,
      p: Math.round(f.percent * 10) / 10,
      st: f.stocks,
      s: f.state,
      mk: f.moveKey,
      sf: f.stateFrame,
      cg: f.charging ? 1 : 0,
      ch: f.charge,
      sh: Math.round(f.shieldHP),
      iv: f.invuln,
      hf: f.hitFlash,
      d: f.dead ? 1 : 0,
      el: f.eliminated ? 1 : 0,
    })),
    pr: match.projectiles.map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      vx: Math.round(p.vx * 10) / 10,
      vy: Math.round(p.vy * 10) / 10,
      w: p.spec.w,
      h: p.spec.h,
      co: p.color,
    })),
    ev: match.events,
    sk: Math.round(match.shake * 10) / 10,
    fr: match.frame,
    ov: match.over ? 1 : 0,
    w: match.winner ? match.winner.index : null,
  };
}

// Rebuild a render-ready, method-free match view from a snapshot.
export function deserializeMatch(snap) {
  const fighters = snap.f.map((s) => {
    const def = getCharacter(s.c);
    return {
      index: s.i,
      charId: s.c,
      def,
      color: s.co || def.color,
      color2: s.c2 || def.color2,
      x: s.x,
      y: s.y,
      facing: s.fc,
      facingVisual: s.fv,
      percent: s.p,
      stocks: s.st,
      state: s.s,
      moveKey: s.mk,
      move: s.mk ? def.moves[s.mk] : null,
      stateFrame: s.sf,
      charging: !!s.cg,
      charge: s.ch,
      shieldHP: s.sh,
      invuln: s.iv,
      hitFlash: s.hf,
      dead: !!s.d,
      eliminated: !!s.el,
    };
  });
  const projectiles = snap.pr.map((p) => ({
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    color: p.co,
    spec: { w: p.w, h: p.h },
  }));
  return {
    fighters,
    projectiles,
    events: snap.ev || [],
    shake: snap.sk,
    frame: snap.fr,
    over: !!snap.ov,
    winner: snap.w != null ? fighters[snap.w] : null,
  };
}
