/**
 * Preload bridge. Exposes exactly the PerchBridge contract as `window.perch`
 * via contextBridge, so the sandboxed renderer reaches privileged main-process
 * capabilities (OS input, screen enumeration, window chrome) without ever
 * gaining Node access itself.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type DesktopSource, type PerchBridge } from '@shared/bridge'
import type { InputEvent } from '@domain/input/InputEvent'

const bridge: PerchBridge = {
  platform: process.platform,
  applyInput: (event: InputEvent): void => {
    ipcRenderer.send(IpcChannels.applyInput, event)
  },
  listScreens: (): Promise<DesktopSource[]> => ipcRenderer.invoke(IpcChannels.listScreens),
  minimize: (): void => {
    ipcRenderer.send(IpcChannels.minimize)
  },
  toggleMaximize: (): void => {
    ipcRenderer.send(IpcChannels.toggleMaximize)
  },
  close: (): void => {
    ipcRenderer.send(IpcChannels.close)
  }
}

// With contextIsolation on (our production config), the bridge must cross the
// isolated world boundary. Fall back to a direct global only when isolation is
// off, matching the standard electron-vite preload pattern.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('perch', bridge)
  } catch (error) {
    console.error('Failed to expose perch bridge:', error)
  }
} else {
  // @ts-expect-error — window.perch is declared readonly for renderer consumers.
  window.perch = bridge
}
