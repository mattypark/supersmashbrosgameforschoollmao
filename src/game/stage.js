// Stage layout. One solid main platform with two grabbable ledges, plus three
// pass-through "soft" platforms. Coordinates are world-space (see constants).

import { STAGE_WIDTH } from './constants.js';

const GROUND_TOP = 542;

export const STAGE = {
  name: 'NEON FLATS',
  // Solid block — collides on top and sides, can't be passed through.
  ground: { x: 296, y: GROUND_TOP, w: 688, h: 220 },
  // Thin one-way platforms: land on them from above, drop through with down.
  platforms: [
    { x: 372, y: 404, w: 196 },
    { x: 712, y: 404, w: 196 },
    { x: 540, y: 286, w: 200 },
  ],
  // Ledges sit at the two top corners of the main block. `dir` is the side of
  // open air the ledge faces (a fighter off the left edge grabs the left ledge).
  ledges: [
    { id: 'L', x: 296, y: GROUND_TOP, dir: -1 },
    { id: 'R', x: 296 + 688, y: GROUND_TOP, dir: 1 },
  ],
  // Where fighters appear at match start / after a KO.
  spawns: [
    { x: 470, y: 240 },
    { x: 590, y: 220 },
    { x: 690, y: 220 },
    { x: 810, y: 240 },
  ],
};

export const groundTop = () => STAGE.ground.y;

// Is x within the solid block's horizontal span?
export const overGround = (x) =>
  x > STAGE.ground.x && x < STAGE.ground.x + STAGE.ground.w;

// Center x of the stage, used for respawn facing and CPU targeting.
export const stageCenterX = () => STAGE_WIDTH / 2;
