# Perch — working notes for Claude

Electron remote-control app (like AnyDesk) with a clean hexagonal/DDD core.
Portable, no-admin. v1: control mouse/keyboard + stream host audio & screen.

## Non-negotiables
- **Dependencies point inward.** `src/domain` and `src/application` must never
  import from `infrastructure`, `main`, `preload`, `renderer`, Electron, WebRTC,
  or nut-js. Only ports (interfaces) cross the boundary.
- **No admin / no installer.** Anything requiring elevation is out of scope for
  the desktop client. macOS Accessibility/Screen-Recording are *user* grants —
  fine. Keep electron-builder targets portable (mac zip, win portable, linux
  AppImage).
- **Validate at the edge.** Every remote input payload goes through
  `InputEventCodec` before it can reach `NutJsInputController`. Never bypass it.
- **Controller is always the WebRTC offerer; host always answers.** This avoids
  glare. Don't add offer logic to the host path.

## Process split (important)
- `nut-js` OS input runs in the **main** process only (`NutJsInputController`).
- WebRTC, WebSocket signaling, screen capture run in the **renderer**.
- The renderer's `IpcInputController` forwards validated input to main via
  `window.perch.applyInput` (contract in `src/shared/bridge.ts`).
- Composition root: `src/renderer/session/usePerchSession.ts` wires use cases to
  adapters. Fresh adapters per session — never reuse a closed transport.

## Conventions
- TS strict + `verbatimModuleSyntax` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`. Use `import type`, guard index access, don't pass
  `undefined` to optional props.
- Domain returns `Result<T>` instead of throwing.
- Small files, one responsibility, top-of-file doc comment explaining WHY.
- UI: dark, minimal (Cursor/Warp feel). Accent amber `--amber` = identity/host;
  teal `--live` = live-connection semantic only. No web fonts (CSP/offline).
  Tokens in `src/renderer/styles/tokens.css`.

## Commands
- `npm run signal` — local signaling server (:8787). Needed for the app to pair.
- `npm run dev` — Electron + HMR. `npm test` — domain/application suites.
- `npm run dist:{mac,win,linux}` — portable builds.

## Extension points (the "future" the ports exist for)
- System-audio driver (macOS virtual device) → a new `MediaSource`.
- P2P/DHT signaling → a new `SignalingChannel`.
- Mobile controllers → a new transport, same ports.
