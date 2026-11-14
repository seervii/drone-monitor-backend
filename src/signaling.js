// Signaling logic, kept separate from the server start-up so it can be mounted inside another Node server:
//   import { attachSignaling } from './signaling.js';
//   attachSignaling(wss);          // wss = any `ws` WebSocketServer
//
// PROTOCOL (every message is JSON text)
//   client -> server
//     { type: 'join',   peer: { id, name, role } }     register; role is 'pilot' or 'robot'
//     { type: 'update', patch: { busy, battery } }     change our own status
//     { type: 'signal', to, kind, data }               relay a handshake message to peer `to`
//   server -> client
//     { type: 'peers',  peers: [ { id, name, role, busy, battery } ] }   everyone online, sent on every change
//     { type: 'signal', from, kind, data }             a relayed message; `from` is set by the server
//   kind = request | accept | reject | offer | answer | ice | hangup
//
// Video, controls and telemetry do NOT pass through here: they go peer-to-peer over WebRTC.

const ROLES = new Set(['pilot', 'robot']);
const KINDS = new Set(['request', 'accept', 'reject', 'offer', 'answer', 'ice', 'hangup']);
const OPEN = 1; // WebSocket "open" state

export function attachSignaling(wss) {
  const clients = new Map(); // peer id -> { ws, peer }

  // Send one JSON message if the socket is still open.
  const send = (ws, obj) => { if (ws.readyState === OPEN) ws.send(JSON.stringify(obj)); };

  // Everyone gets the full list of online peers whenever anything changes.
  const broadcastPeers = () => {
    const peers = [...clients.values()].map((c) => c.peer);
    for (const c of clients.values()) send(c.ws, { type: 'peers', peers });
  };

  // Copy only the status fields we accept, with limits (never trust client input).
  const applyStatus = (peer, s = {}) => {
    if (typeof s.busy === 'boolean') peer.busy = s.busy;
    if (Number.isFinite(s.battery)) peer.battery = Math.max(0, Math.min(100, Math.round(s.battery)));
  };

  wss.on('connection', (ws) => {
    let myId = null;                                  // set once this socket has joined
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });      // answer to our heartbeat ping

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }  // ignore anything that is not JSON

      if (m.type === 'join') {
        const p = m.peer;
        if (!p || !p.id || !ROLES.has(p.role)) return;
        const peer = { id: String(p.id).slice(0, 64), name: String(p.name ?? p.id).slice(0, 40), role: p.role, busy: false };
        applyStatus(peer, p);
        const old = clients.get(peer.id);
        if (old && old.ws !== ws) old.ws.close();     // same id reconnecting: drop the stale socket
        myId = peer.id;
        clients.set(myId, { ws, peer });
        broadcastPeers();
      } else if (!myId) {
        return;                                       // must join before doing anything else
      } else if (m.type === 'update') {
        applyStatus(clients.get(myId).peer, m.patch);
        broadcastPeers();
      } else if (m.type === 'signal') {
        const target = clients.get(m.to);
        if (target && KINDS.has(m.kind)) {
          send(target.ws, { type: 'signal', from: myId, kind: m.kind, data: m.data }); // `from` comes from the server, not the client
        }
      }
    });

    ws.on('close', () => {
      if (myId && clients.get(myId)?.ws === ws) {     // only remove if this socket still owns the id
        clients.delete(myId);
        broadcastPeers();
      }
    });
  });

  // Heartbeat: drop connections that stopped answering (closed laptop, lost Wi-Fi).
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(timer));
}