/**
 * The IPC seam between the sandboxed renderer and the Node-privileged main
 * process. `contextBridge` exposes an object of this exact shape as
 * `window.perch`; both the preload and the renderer import this file so the
 * contract cannot drift.
 */
import type { InputEvent } from '@domain/input/InputEvent'

/** A capturable screen/window, surfaced from Electron's desktopCapturer. */
export interface DesktopSource {
  readonly id: string
  readonly name: string
}

export interface PerchBridge {
  /** Host runtime platform, so the UI can adapt (e.g. macOS traffic lights). */
  readonly platform: 'darwin' | 'win32' | 'linux' | string

  /**
   * Host side: hand a validated input event to the main process, which drives
   * the OS via nut-js. Fire-and-forget — input must never block the render loop.
   */
  applyInput(event: InputEvent): void

  /** List capturable screens so the host can pick what to share. */
  listScreens(): Promise<DesktopSource[]>

  /**
   * This machine's LAN IPv4 (e.g. 192.168.1.20), or null if none is found. The
   * host shows it so a controller on the same network knows what address to
   * dial — the app runs its own signaling rendezvous, so pairing needs no
   * external server.
   */
  getLanAddress(): Promise<string | null>

  /** Window chrome controls for the custom, frameless title bar. */
  minimize(): void
  toggleMaximize(): void
  close(): void
}

/**
 * Port the embedded signaling rendezvous listens on (main process) and that the
 * renderer dials. Shared so main and renderer can never disagree.
 */
export const RENDEZVOUS_PORT = 8787

/** IPC channel names — the single source of truth for main and preload. */
export const IpcChannels = {
  applyInput: 'perch:apply-input',
  listScreens: 'perch:list-screens',
  getLanAddress: 'perch:get-lan-address',
  minimize: 'perch:window-minimize',
  toggleMaximize: 'perch:window-toggle-maximize',
  close: 'perch:window-close'
} as const
