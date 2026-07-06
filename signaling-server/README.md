# Perch signaling server

A tiny standalone WebSocket server that brokers WebRTC handshakes between two Perch peers sharing a room code. Clients send `{ kind: 'join', code, role }` on connect; the server pairs a `host` with a `controller` in the same room, announces each side to the other via `peer-joined`, and relays `offer` / `answer` / `ice` / `peer-left` messages verbatim to the opposite peer. No audio or video ever passes through it — once the handshake completes, media flows directly peer-to-peer.

## Run

From the project root: `npm run signal` (which runs `tsx signaling-server/src/index.ts`). It listens on `ws://localhost:8787` by default; set `PORT` to override. The desktop app connects to `ws://localhost:8787` out of the box.

## Deploy for real (peers on different networks)

A packaged Perch app can't pair two machines on its own: WebRTC needs a common
rendezvous to swap offer/answer/ICE. You host that once — the end user still just
runs the executable. Two pieces:

### 1. Signaling server (this folder) — public `wss://`

This folder is a self-contained deploy artifact (`package.json` + `Dockerfile`,
no Electron/React baggage). It binds `0.0.0.0:$PORT` and answers `GET /healthz`
for platform health checks. The host terminates TLS, giving you `wss://`.

- **Docker / any PaaS (Fly, Render, Railway, a VPS):**
  ```
  cd signaling-server
  docker build -t perch-signal .
  docker run -p 8787:8787 perch-signal      # local check
  ```
  Then deploy that image; the platform injects `PORT` and fronts it with TLS.
- **Without Docker:** `cd signaling-server && npm install && npm start`.
- Verify: `curl https://YOUR-HOST/healthz` → `ok`.

### 2. TURN relay — for NAT traversal

STUN alone fails behind most home/corporate NATs, so cross-network sessions need
a TURN relay. Use a managed service (Metered, Cloudflare, Twilio) or self-host
`coturn` on a VPS. This signaling server does **not** do NAT traversal.

### 3. Point the app at both, then build

Set these in `.env` (see `.env.example` in the repo root) before `npm run dist:*`
— Vite bakes them into the packaged app:

```
VITE_SIGNAL_URL=wss://YOUR-HOST
VITE_ICE_SERVERS=[{"urls":"stun:..."},{"urls":"turn:...","username":"...","credential":"..."}]
```

Ship the resulting build to both machines. No manual server on the user's side.
