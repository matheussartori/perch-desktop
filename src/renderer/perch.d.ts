import type { PerchBridge } from '@shared/bridge'

declare global {
  interface Window {
    /** Exposed by the preload via contextBridge. */
    readonly perch: PerchBridge
  }
}

export {}
