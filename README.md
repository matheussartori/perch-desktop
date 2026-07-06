# Perch

Control another machine remotely — mouse, keyboard, and audio — from a portable
app that installs nothing and never asks for administrator rights.

Perch is the calm, modern alternative to TeamViewer/AnyDesk: you "perch" on a
remote machine and reach it from a distance. Built with Electron + TypeScript on
a clean, hexagonal architecture so the hard parts (transport, OS input, capture)
stay swappable as the product grows toward mobile and audio-driver support.

## What v1 does

- **Host** a machine: publish a short *perch code* and let a controller drive it.
- **Control** a machine: dial a code, see its screen, and drive its mouse and
  keyboard.
- **Audio**: the host streams its audio alongside the screen over WebRTC.
- **Portable & unprivileged**: a single self-contained executable per OS. No
  installer, no admin. (macOS asks the *user* — not an admin — to grant
  Accessibility + Screen Recording the first time, which is by design.)

> Screen streaming is included because you can't control what you can't see;
> the v1 focus is input control + audio riding on top of that link.

## Architecture

Hexagonal + DDD. Dependencies point inward; the domain knows nothing about
Electron, WebRTC, or nut-js.

```
src/
  domain/          Pure TypeScript. No I/O, no framework.
    session/         Session aggregate, SessionCode (the "perch code"), status machine
    input/           InputEvent value objects + codec, InputController port
    signaling/       SignalMessage, SignalingChannel port
    media/           MediaTransport port (WebRTC abstraction)
  application/     Use cases orchestrating the ports
    HostSessionUseCase, JoinSessionUseCase, ApplyRemoteInputUseCase
  infrastructure/  Adapters implementing the ports
    input/           NutJsInputController (main), IpcInputController (renderer)
    signaling/       WebSocketSignalingChannel
    peer/            WebRtcMediaTransport
    capture/         ScreenMediaSource
  main/            Electron main process (window, IPC, OS input execution)
  preload/         contextBridge → window.perch
  renderer/        React UI (composition root lives in session/usePerchSession)
  shared/          Result, Random, DomainEvent, the IPC bridge contract
signaling-server/  Standalone WebSocket rendezvous (relays signaling only)
tests/             Vitest unit + integration suites (domain + application)
```

### Why the layers

- The **domain** is fully unit-tested and framework-free — the session state
  machine and input validation can never be broken by a transport change.
- **Ports** (`InputController`, `SignalingChannel`, `MediaTransport`,
  `MediaSource`) are the seams where the future plugs in: a P2P signaling
  variant, a system-audio driver, or an Android/iOS transport are new adapters,
  not rewrites.
- Input crosses the process boundary safely: the controller sends normalized
  events over a data channel → the host renderer validates them → forwards over
  IPC → `NutJsInputController` drives the OS. A hostile payload is rejected in
  the pure `InputEventCodec` before it can reach the machine.

## Running it (development)

```bash
npm install
npm run signal      # terminal 1 — the local signaling server on :8787
npm run dev         # terminal 2 — the Electron app with HMR
```

Run the app on two machines (or two dev instances) pointed at the same signaling
server. Share a code from one, enter it on the other.

Point the app at a different signaling server with `VITE_SIGNAL_URL`
(e.g. `VITE_SIGNAL_URL=wss://signal.example.com npm run dev`).

## Building portable executables

```bash
npm run dist:mac     # zipped .app (arm64 + x64), unsigned dev build
npm run dist:win     # single portable .exe, runs as the invoking user
npm run dist:linux   # AppImage
```

No installer, no elevation. For release macOS builds, wire signing + notarization
into `electron-builder.yml` (`mac.identity`) in CI.

## Testing

```bash
npm test         # domain + application (pure, fast)
npm run typecheck
```

Infrastructure adapters that need Electron/DOM (WebRTC, nut-js) are exercised by
running the app; the pure core is where the unit + integration suites live.

## Roadmap

- System-audio capture on macOS via a user-installable virtual audio driver, so
  the host's mic/output can be routed as if spoken from the controller's machine.
- Multiple monitors + monitor selection.
- End-to-end encryption of the signaling handshake and per-session PINs.
- TURN relay for restrictive NATs.
- Mobile controllers (Android/iOS).
