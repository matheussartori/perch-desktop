/**
 * Wires the main-process side of the IPC contract. All privileged operations
 * the renderer requests over `window.perch` land here:
 *  - input events are re-validated with the domain codec before ever reaching
 *    the OS-level controller (defense in depth: a compromised renderer must not
 *    be able to inject arbitrary input),
 *  - screen enumeration goes through Electron's desktopCapturer,
 *  - window chrome controls act on the current BrowserWindow.
 */
import { ipcMain, desktopCapturer, type BrowserWindow, type IpcMainEvent } from 'electron'
import { networkInterfaces } from 'node:os'
import { IpcChannels, type DesktopSource } from '@shared/bridge'
import { InputEventCodec } from '@domain/input/InputEvent'
import { NutJsInputController } from '@infrastructure/input/NutJsInputController'

/** First non-internal IPv4 address, so a controller on the LAN knows what to dial. */
function findLanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return null
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // One shared controller: it owns nut-js config and the unknown-key warn cache.
  const inputController = new NutJsInputController()

  ipcMain.on(IpcChannels.applyInput, (_event: IpcMainEvent, payload: unknown) => {
    const result = InputEventCodec.fromObject(payload)
    if (!result.ok) {
      console.warn('registerIpc: rejected malformed input event —', result.error)
      return
    }
    // Fire-and-forget; surface injection failures without crashing the process.
    void inputController.apply(result.value).catch((error) => {
      console.error('registerIpc: applyInput failed —', error)
    })
  })

  ipcMain.handle(IpcChannels.listScreens, async (): Promise<DesktopSource[]> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources.map((source) => ({ id: source.id, name: source.name }))
  })

  ipcMain.handle(IpcChannels.getLanAddress, (): string | null => findLanAddress())

  ipcMain.on(IpcChannels.minimize, () => {
    getWindow()?.minimize()
  })

  ipcMain.on(IpcChannels.toggleMaximize, () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IpcChannels.close, () => {
    getWindow()?.close()
  })
}
