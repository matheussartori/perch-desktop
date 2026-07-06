# Perch

Control another machine remotely — mouse, keyboard, and audio — from a portable
app that installs nothing and never asks for administrator rights.

Perch is the calm, modern alternative to TeamViewer/AnyDesk: you "perch" on a
remote machine and reach it from a distance. Built with Electron + TypeScript on
a clean, hexagonal architecture so the hard parts (transport, OS input, capture)
stay swappable as the product grows toward mobile and system-audio support.

---

## Status — what works today

- ✅ **Host a machine**: share your screen + audio and hand out a *perch code*.
- ✅ **Control a machine**: enter the host's address + code, see its screen, and
  drive its mouse and keyboard.
- ✅ **Zero-config signaling on a LAN**: the app runs its **own signaling
  rendezvous in-process** — no separate server to start. Just the executable.
- ✅ **Portable & unprivileged**: one self-contained executable per OS. No
  installer, no admin. (macOS asks the *user* — not an admin — to grant
  Accessibility + Screen Recording the first time, which is by design.)
- ✅ **Validated at the edge**: every remote input event is re-validated by a
  pure domain codec in the main process before it can touch the OS.

**Not yet verified end-to-end:** a real cross-machine pairing (Mac ↔ Windows).
Every piece is unit-tested and the embedded rendezvous is confirmed working in a
packaged build, but the first two-device run is the next milestone. If it stalls,
suspect the **host's firewall** on port `8787` first.

> Screen streaming is included because you can't control what you can't see; the
> v1 focus is input control + audio riding on top of that link.

---

## How pairing works

Perch is peer-to-peer: screen, audio, and input flow **directly** between the two
machines over WebRTC. But before that direct link exists, the two apps must
exchange a short handshake (offer / answer / ICE). That exchange needs a common
meeting point — the **signaling rendezvous**. Perch embeds it, so the host *is*
the rendezvous.

```
  Windows (HOST)                              Mac (CONTROLLER)
  ┌────────────────────────────┐              ┌────────────────────────────┐
  │ Perch.exe                  │              │ Perch.app                  │
  │  ├─ embedded rendezvous ◄──┼──── ws ──────┼── dials ws://<host-ip>:8787 │
  │  │    listens on *:8787    │              │                            │
  │  └─ renderer ── ws ──► loopback (127.0.0.1)│  renderer (WebRTC offerer) │
  │       (WebRTC answerer)    │              │                            │
  └────────────────────────────┘              └────────────────────────────┘
              ▲                                           │
              └────────── WebRTC P2P, direct ─────────────┘
              screen · audio · input — never through the rendezvous
```

- The **host** app auto-starts the rendezvous and dials its own copy over
  loopback. Its screen shows the **LAN address** to read out.
- The **controller** app enters that **address + code** and connects.
- The perch code (shown as `ABC-DEF-GHJ`) pairs the two sides inside the
  rendezvous; media never passes through it.
- Roles are symmetric — either OS can host or control. The controller is always
  the WebRTC offerer; the host always answers (this avoids glare).

---

## Quick start (development)

```bash
npm install
npm run dev          # Electron + HMR. The rendezvous starts inside the app.
```

You do **not** need to run a separate signaling server — it's embedded. (The
standalone `npm run signal` still exists for hosted/internet deployments; see
[Signaling modes](#signaling-modes).)

To try both roles on **one machine**: open two dev instances, host from one, and
on the other enter `127.0.0.1` as the address plus the code.

---

## Build portable executables

```bash
npm run dist:mac     # zipped .app (arm64 + x64) → dist/
npm run dist:win     # single portable .exe       → dist/
npm run dist:linux   # AppImage                    → dist/
```

No installer, no elevation. Builds are **unsigned** (dev). Artifacts land in
`dist/`:

| File | For |
| --- | --- |
| `Perch-<v>-arm64-mac.zip` | Apple Silicon Mac |
| `Perch-<v>-mac.zip` | Intel Mac |
| `Perch-<v>-portable.exe` | Windows (x64) |
| `Perch-<v>.AppImage` | Linux (x64) |

`dist:win` can be produced from macOS — electron-builder fetches wine
automatically for the cross-build.

---

## Test on two machines (same Wi-Fi / LAN)

Currently supported setup: both devices on the **same network**. Example below is
controlling a **Windows host** from a **Mac controller**.

### 1. Host — the Windows machine

1. Copy `Perch-<v>-portable.exe` over and run it.
2. First launch: **Windows Firewall will prompt** — click **Allow** (at least on
   *Private* networks). Without this, the Mac can't reach the rendezvous on
   `8787`.
3. Click **Share this screen**. Note the **Address** (e.g. `192.168.1.20`) and
   the **perch code** shown.

### 2. Controller — the Mac

1. Unzip `Perch-<v>-arm64-mac.zip`.
2. It's unsigned, so clear the quarantine flag before opening:
   ```bash
   xattr -dr com.apple.quarantine /path/to/Perch.app
   ```
   (Or right-click → **Open** → confirm once.)
3. Open Perch → enter the Windows **Address** + **code** → **Connect**.

### Notes

- The host **IP is typed at runtime** — if it changes, just retype it. No rebuild.
- macOS may also prompt about *incoming* connections (the Mac runs an idle
  rendezvous too). Allow or deny — it doesn't affect the controller role.
- If the host is a **Mac** instead, it needs Accessibility + Screen-Recording
  grants (System Settings → Privacy) the first time — user grants, no admin.

---

## Signaling modes

### LAN mode (default — what's wired now)

Nothing to configure. The host embeds the rendezvous; the controller dials the
host's LAN IP. Works offline, no accounts, no external server.

### Internet mode (different networks)

For peers on different networks you host the rendezvous publicly and add a TURN
relay for NAT traversal, then bake the URLs into the build. The app already reads
them from build-time env — set them in `.env` (see `.env.example`):

```dotenv
VITE_SIGNAL_URL=wss://your-signal-host          # overrides LAN mode for both sides
VITE_ICE_SERVERS=[{"urls":"stun:..."},{"urls":"turn:...","username":"...","credential":"..."}]
```

When `VITE_SIGNAL_URL` is set it wins for both host and controller (the typed
address is ignored). Deployment steps for the standalone server (Docker, health
checks, TURN) live in [`signaling-server/README.md`](signaling-server/README.md).

---

## Configuration

Build-time env (read by Vite, baked into the packaged app). Copy `.env.example`
to `.env` to use:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SIGNAL_URL` | *(unset → LAN mode)* | Hosted signaling URL; overrides LAN mode |
| `VITE_ICE_SERVERS` | Google STUN only | JSON array of `RTCIceServer`; add TURN for cross-network |
| `PORT` (server) | `8787` | Port for the standalone `npm run signal` |

The embedded rendezvous port is fixed at `8787` (`RENDEZVOUS_PORT` in
`src/shared/bridge.ts`), shared by main and renderer so they can't disagree.

---

## Architecture

Hexagonal + DDD. Dependencies point inward; the domain knows nothing about
Electron, WebRTC, or nut-js. Only ports (interfaces) cross the boundary.

- The **domain** is fully unit-tested and framework-free — the session state
  machine and input validation can never be broken by a transport change.
- **Ports** (`InputController`, `SignalingChannel`, `MediaTransport`,
  `MediaSource`) are the seams where the future plugs in: a P2P signaling
  variant, a system-audio driver, or an Android/iOS transport are new adapters,
  not rewrites.
- **Input crosses the process boundary safely**: the controller sends normalized
  events over a data channel → the host renderer validates them → forwards over
  IPC → `NutJsInputController` drives the OS. A hostile payload is rejected in the
  pure `InputEventCodec` before it can reach the machine.

### Process split

- `nut-js` OS input runs in the **main** process only (`NutJsInputController`).
- WebRTC, screen capture, and the signaling *client* run in the **renderer**.
- The signaling *rendezvous* (server) runs in **main** (`src/main/rendezvous.ts`),
  reusing the same `SignalingServer` the standalone deploy uses.
- Composition root: `src/renderer/session/usePerchSession.ts` wires use cases to
  fresh adapters per session.

### Project layout

```
src/
  domain/          Pure TypeScript. No I/O, no framework.
    session/         Session aggregate, SessionCode (the "perch code"), status machine
    input/           InputEvent value objects + codec, InputController port
    signaling/       SignalMessage, SignalingChannel port
    media/           MediaTransport / MediaSource ports (WebRTC abstraction)
  application/     Use cases: HostSessionUseCase, JoinSessionUseCase, ApplyRemoteInputUseCase
  infrastructure/  Adapters implementing the ports
    input/           NutJsInputController (main), IpcInputController (renderer)
    signaling/       WebSocketSignalingChannel
    peer/            WebRtcMediaTransport (ICE servers from VITE_ICE_SERVERS)
    capture/         ScreenMediaSource
  main/            Electron main: window, IPC, OS input, embedded rendezvous
  preload/         contextBridge → window.perch
  renderer/        React UI (composition root in session/usePerchSession)
  shared/          Result, Random, the IPC bridge contract, RENDEZVOUS_PORT
signaling-server/  Standalone WebSocket rendezvous (Docker-deployable, relays signaling only)
tests/             Vitest unit + integration suites (domain + application)
```

---

## Testing

```bash
npm test         # domain + application suites (pure, fast)
npm run typecheck
```

Infrastructure adapters that need Electron/DOM (WebRTC, nut-js, capture) are
exercised by running the app; the pure core carries the unit + integration suites.

---

## Next steps

Roughly in priority order:

1. **First real two-device run** (Mac ↔ Windows on one LAN) — the immediate
   milestone. Confirm firewall allow, screen capture, and input injection
   end-to-end.
2. **mDNS / Bonjour auto-discovery** so the controller finds the host by code
   alone, dropping the typed IP. Turns LAN pairing into pure code entry.
3. **Internet mode**: deploy `signaling-server/` behind `wss://` + a TURN relay,
   and ship a build with `VITE_SIGNAL_URL` / `VITE_ICE_SERVERS` set. See
   [`signaling-server/README.md`](signaling-server/README.md).
4. **App icon + code signing / notarization** (macOS `mac.identity`, Windows
   cert) so builds open without the quarantine dance.
5. **Multiple monitors** + monitor selection on the host.
6. **Per-session PINs** and end-to-end encryption of the signaling handshake.
7. **System-audio capture** on macOS via a user-installable virtual audio driver.
8. **Mobile controllers** (Android/iOS) as a new transport against the same ports.
```
