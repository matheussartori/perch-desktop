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
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
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

  // Serial actuation queue. Each nut-js call is an async native round-trip; firing
  // them concurrently let events race and land out of order. We drain one at a
  // time and — crucially — collapse consecutive pointer-moves: a fresh position
  // supersedes an older one still waiting, so the cursor never chases a backlog
  // of stale coordinates. Discrete events (clicks/keys/scroll) keep their order.
  const queue: InputEvent[] = []
  let draining = false

  async function drain(): Promise<void> {
    draining = true
    while (queue.length > 0) {
      const event = queue.shift() as InputEvent
      try {
        await inputController.apply(event)
      } catch (error) {
        console.error('registerIpc: applyInput failed —', error)
      }
    }
    draining = false
  }

  function enqueue(event: InputEvent): void {
    const last = queue[queue.length - 1]
    if (event.type === 'pointer-move' && last?.type === 'pointer-move') {
      queue[queue.length - 1] = event
    } else {
      queue.push(event)
    }
    if (!draining) void drain()
  }

  ipcMain.on(IpcChannels.applyInput, (_event: IpcMainEvent, payload: unknown) => {
    const result = InputEventCodec.fromObject(payload)
    if (!result.ok) {
      console.warn('registerIpc: rejected malformed input event —', result.error)
      return
    }
    enqueue(result.value)
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
