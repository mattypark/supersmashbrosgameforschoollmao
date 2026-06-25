// Authoritative room server. Runs the SAME deterministic sim the client uses,
// collects each player's input, and broadcasts state snapshots ~60x/sec. Built
// for a school LAN: near-zero latency, simple, debuggable, cheat-resistant.
//
//   npm install        (installs the single `ws` dependency)
//   npm start          (or: node server.js [port])

import { WebSocketServer } from 'ws';
import { createMatch, stepMatch } from '../src/game/match.js';
import { serializeMatch } from '../src/net/snapshot.js';

const PORT = Number(process.argv[2]) || 8080;
const TICK_MS = 1000 / 60;
const MAX_PLAYERS = 4;

const wss = new WebSocketServer({ port: PORT });
console.log(`SMASH ARENA room server listening on ws://localhost:${PORT}`);
console.log('Share your LAN address (e.g. ws://192.168.x.x:%d) with players.', PORT);

const neutralInput = () => ({
  axisX: 0,
  axisY: 0,
  left: false,
  right: false,
  up: false,
  down: false,
  attackPressed: false,
  attackHeld: false,
  specialPressed: false,
  specialHeld: false,
  jumpPressed: false,
  jumpHeld: false,
  grabPressed: false,
  shieldHeld: false,
  flickX: 0,
  flickY: 0,
  connected: true,
});

const room = {
  players: [], // { ws, name, charId, lobbyIndex, matchIndex, input }
  match: null,
  loop: null,
  running: false,
};

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const p of room.players) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function lobbyState() {
  return {
    t: 'lobby',
    count: room.players.length,
    running: room.running,
    players: room.players.map((p) => ({
      index: p.lobbyIndex,
      name: p.name,
      charId: p.charId,
    })),
  };
}

function startMatch() {
  if (room.running || room.players.length < 2) return;
  room.players.forEach((p, i) => {
    p.matchIndex = i;
    p.input = neutralInput();
  });
  const config = {
    stocks: 3,
    players: room.players.map((p) => ({ charId: p.charId, type: 'human', skin: p.skin || 0 })),
  };
  room.match = createMatch(config);
  room.running = true;

  // tell each player which fighter is theirs
  for (const p of room.players) {
    if (p.ws.readyState === p.ws.OPEN) {
      p.ws.send(JSON.stringify({ t: 'start', index: p.matchIndex }));
    }
  }

  room.loop = setInterval(() => {
    const inputs = room.players.map((p) => p.input || neutralInput());
    // pad to fighter count
    while (inputs.length < room.match.fighters.length) inputs.push(neutralInput());
    stepMatch(room.match, inputs);
    broadcast({ t: 'state', s: serializeMatch(room.match) });

    // consume edge-triggered inputs so a single press fires once
    for (const p of room.players) {
      if (!p.input) continue;
      p.input.attackPressed = false;
      p.input.specialPressed = false;
      p.input.jumpPressed = false;
      p.input.grabPressed = false;
      p.input.flickX = 0;
      p.input.flickY = 0;
    }

    if (room.match.over) endMatch();
  }, TICK_MS);
}

function endMatch() {
  clearInterval(room.loop);
  room.loop = null;
  room.running = false;
  broadcast({ t: 'over', winner: room.match.winner ? room.match.winner.index : null });
  room.match = null;
}

function assignLobbyIndex() {
  const taken = new Set(room.players.map((p) => p.lobbyIndex));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
  return -1;
}

wss.on('connection', (ws) => {
  if (room.players.length >= MAX_PLAYERS || room.running) {
    ws.send(JSON.stringify({ t: 'full' }));
    ws.close();
    return;
  }
  const player = {
    ws,
    name: `P${room.players.length + 1}`,
    charId: 'volt',
    skin: 0,
    lobbyIndex: assignLobbyIndex(),
    matchIndex: -1,
    input: neutralInput(),
  };
  room.players.push(player);
  ws.send(JSON.stringify({ t: 'welcome', index: player.lobbyIndex }));
  broadcast(lobbyState());

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'join') {
      player.name = (msg.name || player.name).slice(0, 10);
      if (msg.charId) player.charId = msg.charId;
      if (msg.skin != null) player.skin = msg.skin;
      broadcast(lobbyState());
    } else if (msg.t === 'char') {
      player.charId = msg.charId;
      if (msg.skin != null) player.skin = msg.skin;
      broadcast(lobbyState());
    } else if (msg.t === 'start') {
      startMatch();
    } else if (msg.t === 'input' && room.running) {
      // merge so edge flags set this frame survive until consumed
      const inp = msg.i;
      const cur = player.input;
      player.input = {
        ...inp,
        attackPressed: inp.attackPressed || cur.attackPressed,
        specialPressed: inp.specialPressed || cur.specialPressed,
        jumpPressed: inp.jumpPressed || cur.jumpPressed,
        grabPressed: inp.grabPressed || cur.grabPressed,
        flickX: inp.flickX || cur.flickX,
        flickY: inp.flickY || cur.flickY,
      };
    }
  });

  ws.on('close', () => {
    const idx = room.players.indexOf(player);
    if (idx >= 0) room.players.splice(idx, 1);
    // if they were fighting, drop their fighter out
    if (room.running && room.match) {
      const f = room.match.fighters[player.matchIndex];
      if (f) {
        f.eliminated = true;
        f.dead = true;
        f.stocks = 0;
      }
    }
    broadcast(lobbyState());
    if (room.players.length === 0 && room.loop) endMatch();
  });
});
