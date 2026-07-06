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

  /** Window chrome controls for the custom, frameless title bar. */
  minimize(): void
  toggleMaximize(): void
  close(): void
}

/** IPC channel names — the single source of truth for main and preload. */
export const IpcChannels = {
  applyInput: 'perch:apply-input',
  listScreens: 'perch:list-screens',
  minimize: 'perch:window-minimize',
  toggleMaximize: 'perch:window-toggle-maximize',
  close: 'perch:window-close'
} as const
