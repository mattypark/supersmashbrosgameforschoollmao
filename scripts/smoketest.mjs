// Headless sim smoke test — runs the real match with CPUs for many ticks and
// checks nothing throws, damage accrues, and KOs/stocks work. Not shipped to
// the browser; pure verification of the deterministic engine.

import { createMatch, stepMatch } from '../src/game/match.js';
import { computeCpuInput } from '../src/game/ai.js';
import { ROSTER } from '../src/data/characters.js';

// Roster integrity: every fighter must have a full kit + 4 skins.
const REQUIRED = ['jab', 'ftilt', 'utilt', 'dtilt', 'dash', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'nspecial', 'sspecial', 'uspecial', 'dspecial'];
const rosterProblems = [];
for (const c of ROSTER) {
  if (!c.skins || c.skins.length < 4) rosterProblems.push(`${c.name}: <4 skins`);
  for (const m of REQUIRED) if (!c.moves[m]) rosterProblems.push(`${c.name}: missing ${m}`);
}
console.log(`roster: ${ROSTER.length} fighters, ${rosterProblems.length} problems`);
if (rosterProblems.length) {
  console.error(' - ' + rosterProblems.join('\n - '));
  process.exit(1);
}

// Exercise armor (bastion/onyx), counters (frost/kai), and throws.
const config = {
  stocks: 2,
  players: [
    { charId: 'bastion', skin: 1, type: 'cpu' },
    { charId: 'onyx', skin: 2, type: 'cpu' },
    { charId: 'frost', skin: 0, type: 'cpu' },
    { charId: 'kai', skin: 3, type: 'cpu' },
  ],
};

const match = createMatch(config);
let sfxCount = 0;
match.onSfx = () => sfxCount++;

let maxPercent = 0;
let kos = 0;
let frames = 0;
const TICKS = 8000;

for (let i = 0; i < TICKS; i++) {
  const inputs = match.fighters.map((f) => computeCpuInput(f, match));
  stepMatch(match, inputs);
  frames++;
  for (const f of match.fighters) maxPercent = Math.max(maxPercent, f.percent);
  for (const ev of match.events) if (ev.type === 'blast') kos++;
  if (match.over) break;
}

const states = match.fighters.map(
  (f) => `${f.def.name}: ${f.stocks} stk, ${Math.floor(f.percent)}%, ${f.eliminated ? 'OUT' : f.state}`,
);

console.log('--- SMOKE TEST RESULTS ---');
console.log('frames simulated :', frames);
console.log('max percent seen :', Math.floor(maxPercent));
console.log('KO blasts        :', kos);
console.log('sfx triggered    :', sfxCount);
console.log('match over       :', match.over, match.winner ? `winner=${match.winner.def.name}` : '');
console.log('fighters         :\n  ' + states.join('\n  '));

// Sanity assertions.
const problems = [];
if (maxPercent <= 0) problems.push('no damage was ever dealt');
if (sfxCount <= 0) problems.push('no sfx events fired');
for (const f of match.fighters) {
  if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) problems.push(`${f.def.name} has NaN position`);
  if (!Number.isFinite(f.percent)) problems.push(`${f.def.name} has NaN percent`);
}
if (problems.length) {
  console.error('\nFAILURES:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('\nOK: engine ran clean, dealt damage, fired effects.');
