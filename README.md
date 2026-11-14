# Drone Monitor Signaling Server

Small WebSocket server (Node + `ws`) that lets pilots and robots find each other and exchange the WebRTC handshake.
Video, controls and telemetry go peer-to-peer and never pass through this server.

## Run
```
npm install
npm start          # ws://localhost:8080  (PORT env var to change)
npm run dev        # same, restarts on file changes
```

## Protocol (every message is JSON text)
Client to server:
- `{ type: 'join', peer: { id, name, role } }` register; role is `pilot` or `robot`
- `{ type: 'update', patch: { busy, battery } }` change own status
- `{ type: 'signal', to, kind, data }` relay a handshake message to peer `to`

Server to client:
- `{ type: 'peers', peers: [{ id, name, role, busy, battery }] }` everyone online, sent on every change
- `{ type: 'signal', from, kind, data }` relayed message; `from` is set by the server

`kind` is one of `request`, `accept`, `reject`, `offer`, `answer`, `ice`, `hangup`.

## Using it inside an existing server
All logic is in `src/signaling.js`. In an existing Node app that already has a `ws` WebSocketServer:
```js
import { attachSignaling } from './signaling.js';
attachSignaling(wss);
```
If the real backend is in another language, treat this file and the protocol above as the reference to port.

## Not included yet (belongs to the real backend)
Authentication (ids are currently chosen by the client), a registry of which robots belong to whom,
persistence, a TURN server for connections across networks, telemetry history, HTTPS/WSS in production.