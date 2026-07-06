# Perch signaling server

A tiny standalone WebSocket server that brokers WebRTC handshakes between two Perch peers sharing a room code. Clients send `{ kind: 'join', code, role }` on connect; the server pairs a `host` with a `controller` in the same room, announces each side to the other via `peer-joined`, and relays `offer` / `answer` / `ice` / `peer-left` messages verbatim to the opposite peer. No audio or video ever passes through it — once the handshake completes, media flows directly peer-to-peer.

## Run

From the project root: `npm run signal` (which runs `tsx signaling-server/src/index.ts`). It listens on `ws://localhost:8787` by default; set `PORT` to override. The desktop app connects to `ws://localhost:8787` out of the box.

## Production note

For real deployments you would put this behind `wss://` (TLS-terminated) and pair it with STUN/TURN servers so peers behind NATs and firewalls can actually establish the direct WebRTC connection. This server handles signaling only — it does not do NAT traversal.
