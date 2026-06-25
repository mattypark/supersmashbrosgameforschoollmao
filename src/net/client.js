// Thin WebSocket client for online play. Sends this player's input each tick and
// receives authoritative state snapshots from the room server.

export class NetClient {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.ws = null;
    this.index = -1;
    this.connected = false;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.handlers.onLog?.('Bad address: ' + e.message);
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this.handlers.onOpen?.();
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.handlers.onClose?.();
    };
    this.ws.onerror = () => this.handlers.onLog?.('Connection error.');
    this.ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'welcome':
          this.index = msg.index;
          this.handlers.onWelcome?.(msg);
          break;
        case 'lobby':
          this.handlers.onLobby?.(msg);
          break;
        case 'start':
          this.handlers.onStart?.(msg);
          break;
        case 'state':
          this.handlers.onState?.(msg.s);
          break;
        case 'over':
          this.handlers.onOver?.(msg);
          break;
        default:
          break;
      }
    };
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  join(name, charId, skin = 0) {
    this._send({ t: 'join', name, charId, skin });
  }

  setChar(charId) {
    this._send({ t: 'char', charId });
  }

  start() {
    this._send({ t: 'start' });
  }

  // Send a trimmed input payload (only the bits the sim reads).
  sendInput(s) {
    this._send({
      t: 'input',
      i: {
        axisX: s.axisX,
        axisY: s.axisY,
        left: s.left,
        right: s.right,
        up: s.up,
        down: s.down,
        attackPressed: s.attackPressed,
        attackHeld: s.attackHeld,
        specialPressed: s.specialPressed,
        specialHeld: s.specialHeld,
        jumpPressed: s.jumpPressed,
        jumpHeld: s.jumpHeld,
        grabPressed: s.grabPressed,
        shieldHeld: s.shieldHeld,
        flickX: s.flickX,
        flickY: s.flickY,
        connected: true,
      },
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
