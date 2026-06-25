// Authoritative room server. Runs the SAME deterministic sim the client uses,
// collects each player's input, and broadcasts state snapshots ~60x/sec. Built
// for a school LAN: near-zero latency, simple, debuggable, cheat-resistant.
//
//   npm install        (installs the single `ws` dependency)
//   npm start          (or: node server.js [port])

import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatch, stepMatch } from '../src/game/match.js';
import { serializeMatch } from '../src/net/snapshot.js';

// PORT comes from the host (Render/Railway/Fly set process.env.PORT), then an
// explicit arg, else 8080.
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8080;
const TICK_MS = 1000 / 60;
const MAX_PLAYERS = 4;

// --- static file server: serve the whole client from the project root --------
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const httpServer = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

// WebSocket shares the same HTTP server / port — one URL serves game + matches.
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => {
  console.log(`SMASH ARENA running on http://localhost:${PORT}  (game + multiplayer, one port)`);
  console.log('LAN: share http://<your-ip>:%d  ·  deploy this server to play over the internet.', PORT);
});

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
      // sanitize untrusted client input, then merge so edge flags survive until consumed
      const inp = msg.i || {};
      const num = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
      const bool = (v) => v === true;
      const clean = {
        axisX: num(inp.axisX),
        axisY: num(inp.axisY),
        left: bool(inp.left),
        right: bool(inp.right),
        up: bool(inp.up),
        down: bool(inp.down),
        attackPressed: bool(inp.attackPressed),
        attackHeld: bool(inp.attackHeld),
        specialPressed: bool(inp.specialPressed),
        specialHeld: bool(inp.specialHeld),
        jumpPressed: bool(inp.jumpPressed),
        jumpHeld: bool(inp.jumpHeld),
        grabPressed: bool(inp.grabPressed),
        shieldHeld: bool(inp.shieldHeld),
        flickX: num(inp.flickX),
        flickY: num(inp.flickY),
        connected: true,
      };
      const cur = player.input;
      player.input = {
        ...clean,
        attackPressed: clean.attackPressed || cur.attackPressed,
        specialPressed: clean.specialPressed || cur.specialPressed,
        jumpPressed: clean.jumpPressed || cur.jumpPressed,
        grabPressed: clean.grabPressed || cur.grabPressed,
        flickX: clean.flickX || cur.flickX,
        flickY: clean.flickY || cur.flickY,
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
