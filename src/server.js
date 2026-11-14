import { WebSocketServer } from 'ws';
import { attachSignaling } from './signaling.js';

const port = Number(process.env.PORT) || 8080;                       // PORT env var, default 8080
const wss = new WebSocketServer({ port, maxPayload: 256 * 1024 });   // ignore messages bigger than 256 KB
attachSignaling(wss);                                                // all the real logic lives there
console.log(`Signaling server listening on ws://localhost:${port}`);