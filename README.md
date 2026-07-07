<h1 align="center">Perch</h1>

<p align="center">
  Control another machine remotely — screen, audio, mouse and keyboard — from a portable app that installs nothing and never asks for admin rights.
</p>

<p align="center">
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" alt="Electron" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://webrtc.org"><img src="https://img.shields.io/badge/WebRTC-P2P-333333?logo=webrtc&logoColor=white" alt="WebRTC" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://buymeacoffee.com/mattsartori"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#pairing-over-the-internet">Internet Pairing</a> ·
  <a href="#development">Development</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#support">Support</a>
</p>

Perch is a remote-control app in the TeamViewer/AnyDesk space: you "perch" on a remote machine and drive it from a distance. Media and input flow directly between the two machines over WebRTC — on a LAN there is no server at all, because the host app embeds its own signaling rendezvous. It ships as one self-contained executable per OS and never needs elevation: the only permissions involved are macOS's per-user Accessibility and Screen Recording grants.

## Features

- **Host a machine** — share screen and audio and hand out a *perch code* (`ABC-DEF-GHJ`). The controller enters the host's address plus that code and takes the mouse and keyboard.
- **Zero-config LAN pairing** — the host runs the signaling rendezvous in-process (port `8787`), so on a shared network the executable is all you need. No accounts, no external server, works offline.
- **Internet pairing** — point a build at a hosted [perch-signaling-server](https://github.com/matheussartori/perch-signaling-server) and pairing works by code alone across networks (with a TURN relay for hard NATs).
- **Tuned for interactive latency** — the offer prefers H.264 so the host encodes on platform hardware (VideoToolbox / MediaFoundation), the receive side zeroes the jitter buffer (~90 ms saved on the controller), the encoder ramps to a steady 8 Mbps ceiling for 1080p60 screen content, and input rides a lossy ordered data channel so one dropped packet never head-of-line-blocks the next. A toolbar readout (`H264 · 1080p60 · buffer 8ms · decode 2ms`) keeps the numbers visible while you work.
- **Portable and unprivileged** — mac zip, Windows portable `.exe`, Linux AppImage. No installer, no admin, nothing written outside the app.
- **Input validated at the edge** — every remote input event is re-validated by a pure domain codec in the main process before it can touch the OS. A hostile payload is rejected before it reaches the input driver.
- **Symmetric roles** — either OS can host or control; the same binary does both.

## Getting Started

There are no published releases yet — build from source (Node 20+):

```bash
git clone https://github.com/matheussartori/perch-desktop.git
cd perch-desktop
npm install
npm run dev     # Electron + HMR; the rendezvous starts inside the app
```

To try both roles on one machine, open two dev instances, host from one, and connect from the other using `127.0.0.1` plus the code.

Portable builds land in `dist/`:

```bash
npm run dist:mac     # zipped .app (arm64 + x64)
npm run dist:win     # single portable .exe — cross-builds from macOS (wine is fetched automatically)
npm run dist:linux   # AppImage
```

Builds are unsigned for now. On macOS, clear the quarantine flag before first launch (`xattr -dr com.apple.quarantine /path/to/Perch.app`) or right-click ▸ **Open**.

## Usage

Both machines on the same network; the example controls a Windows host from a Mac.

**On the host (Windows):**

1. Run `Perch-<version>-portable.exe`. When Windows Firewall prompts on first launch, click **Allow** (at least for *Private* networks) — without it the controller can't reach the rendezvous on `8787`.
2. Click **Share this screen**. Note the **Address** (e.g. `192.168.1.20`) and the **perch code** it shows.

**On the controller (Mac):**

1. Unzip and open Perch (see the quarantine note above).
2. Enter the host's **Address** and **code**, hit **Connect**. The host's screen appears and your mouse and keyboard drive it.

A few notes:

- The host IP is typed at connect time — if it changes, retype it. Nothing is baked into the build for LAN use.
- If the *host* is a Mac, it needs the Accessibility and Screen Recording grants (System Settings ▸ Privacy & Security) the first time. These are per-user grants, not admin.
- macOS may also ask about incoming connections on the controller side (it runs an idle rendezvous too); either answer is fine for controlling.
- If a connection stalls, suspect the host's firewall on port `8787` first.

### How pairing works

Before the direct WebRTC link exists, the two apps exchange a short handshake (offer / answer / ICE) through a meeting point — the rendezvous. On a LAN, the host *is* the rendezvous:

```
  Windows (HOST)                               Mac (CONTROLLER)
  ┌────────────────────────────┐               ┌────────────────────────────┐
  │ Perch.exe                  │               │ Perch.app                  │
  │  ├─ embedded rendezvous ◄──┼───── ws ──────┼── dials ws://<host-ip>:8787│
  │  │    listens on *:8787    │               │                            │
  │  └─ renderer ─ ws ─► loopback              │  renderer (WebRTC offerer) │
  │       (WebRTC answerer)    │               │                            │
  └────────────────────────────┘               └────────────────────────────┘
              ▲                                            │
              └─────────── WebRTC P2P, direct ─────────────┘
              screen · audio · input — never through the rendezvous
```

The perch code pairs the two sides inside the rendezvous; media never passes through it. The controller is always the WebRTC offerer and the host always answers, which avoids signaling glare.

## Pairing over the internet

For peers on different networks, host the same rendezvous publicly and add a TURN relay for NAT traversal. The standalone, Docker-deployable copy of the server — with Koyeb free-tier deployment steps and a ready-to-run coturn setup — lives in [perch-signaling-server](https://github.com/matheussartori/perch-signaling-server).

The URLs are baked in at build time. Copy `.env.example` to `.env` and set:

```dotenv
VITE_SIGNAL_URL=wss://your-signal-host
VITE_ICE_SERVERS=[{"urls":"stun:..."},{"urls":"turn:...","username":"...","credential":"..."}]
```

When `VITE_SIGNAL_URL` is set it wins for both roles: the Connect screen drops the IP field and pairing is by code alone. Use `wss://` — a packaged app is a secure origin and cannot open plain `ws://`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SIGNAL_URL` | *(unset → LAN mode)* | Hosted signaling URL; overrides the embedded rendezvous for both sides |
| `VITE_ICE_SERVERS` | Google STUN only | JSON array of `RTCIceServer`. Across the internet you need TURN — STUN alone fails behind symmetric NAT/CGNAT. List both UDP and TCP transports. |

The embedded rendezvous port is fixed at `8787` (`RENDEZVOUS_PORT` in `src/shared/bridge.ts`, shared by main and renderer so they can't disagree).

## Development

```bash
npm run dev          # Electron + Vite HMR
npm test             # domain + application suites (pure, fast)
npm run typecheck    # tsc --noEmit
```

| Command | Description |
| --- | --- |
| `npm run dev` | Electron with HMR (electron-vite) |
| `npm test` | Run the Vitest suites |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run package` | Unpacked build via electron-builder |
| `npm run dist:{mac,win,linux}` | Portable distributables |

The domain and application layers carry the unit and integration tests and run without Electron. Infrastructure adapters that need a real browser or OS (WebRTC, screen capture, nut-js) are exercised by running the app.

## Architecture

Hexagonal + DDD. Dependencies point inward: `src/domain` and `src/application` never import Electron, WebRTC or nut-js — only ports (interfaces) cross the boundary. That's what keeps the hard parts swappable: a P2P signaling variant, a macOS system-audio driver, or a mobile controller are new adapters against the same ports, not rewrites.

```
src/
  domain/          Pure TypeScript. No I/O, no framework.
    session/         Session aggregate, SessionCode (the perch code), status machine
    input/           InputEvent value objects + codec, InputController port
    signaling/       SignalMessage, SignalingChannel port
    media/           MediaTransport / MediaSource ports (WebRTC abstraction)
  application/     Use cases: HostSessionUseCase, JoinSessionUseCase, ApplyRemoteInputUseCase
  infrastructure/  Adapters implementing the ports
    input/           NutJsInputController (main), IpcInputController (renderer)
    signaling/       WebSocketSignalingChannel
    peer/            WebRtcMediaTransport (codec prefs, jitter tuning, receive stats)
    capture/         ScreenMediaSource
  main/            Electron main: window, IPC, OS input, embedded rendezvous
    rendezvous/      The embedded signaling server — same code as the standalone deploy
  preload/         contextBridge → window.perch
  renderer/        React UI; composition root in session/usePerchSession.ts
  shared/          Result, Random, the IPC bridge contract, RENDEZVOUS_PORT
tests/             Vitest suites for domain + application
```

The process split matters:

- `nut-js` OS input runs in the **main** process only. WebRTC, screen capture and the signaling *client* run in the **renderer**.
- The signaling *server* (rendezvous) runs in **main** (`src/main/rendezvous/`) — the same code deployed standalone from the [perch-signaling-server](https://github.com/matheussartori/perch-signaling-server) repo, kept byte-for-byte in sync.
- Input crosses the boundary safely: controller → data channel → host renderer validates → IPC → `NutJsInputController` drives the OS. The pure `InputEventCodec` is the gate; nothing bypasses it.
- `usePerchSession.ts` is the composition root and wires fresh adapters per session — a closed transport is never reused.

Part of the Perch ecosystem:

| Repo | Role |
| --- | --- |
| perch-desktop | This repo — the Electron app for hosting & controlling machines |
| [perch-signaling-server](https://github.com/matheussartori/perch-signaling-server) | The hosted rendezvous for internet mode, plus the TURN relay setup |

## Roadmap

Roughly in priority order:

1. First verified cross-machine run (Mac ↔ Windows on one LAN) — every piece is unit-tested and the packaged rendezvous works, but the two-device milestone hasn't been checked off yet.
2. mDNS/Bonjour discovery so LAN pairing needs only the code, not a typed IP.
3. A hosted signaling deployment + TURN baked into a public build (internet mode out of the box).
4. App icon, code signing and notarization, so builds open without the quarantine dance.
5. Multi-monitor support with monitor selection on the host.
6. Per-session PINs and an encrypted signaling handshake.
7. System-audio capture on macOS via a user-installable virtual audio device.
8. Mobile controllers (Android/iOS) as a new transport against the same ports.

## Support

Perch is a solo, open-source project. If it's useful to you and you'd like to help fund its development, you can buy me a coffee — genuinely appreciated. ☕

<p align="center">
  <a href="https://buymeacoffee.com/mattsartori">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50" />
  </a>
</p>

## License

[MIT](./LICENSE) © [Matheus Sartori](https://github.com/matheussartori)
