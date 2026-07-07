/**
 * Electron main-process entry. Owns the frameless application window and the
 * app lifecycle, and installs the IPC handlers that back `window.perch`.
 *
 * The window is intentionally frameless with a custom title bar (traffic lights
 * kept inset on macOS) to match Perch's chrome; the renderer draws its own
 * window controls and talks back over IPC.
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc/registerIpc'
import { startRendezvous } from './rendezvous'

// GPU compositing switches that keep decoded WebRTC frames on the GPU all the
// way to the screen (zero-copy), trimming render latency on the controller
// side. Must be set before app ready; harmless no-ops where unsupported.
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    // Keep macOS traffic lights, inset, for a native feel behind our own chrome.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    transparent: false,
    backgroundColor: '#0B0C0F',
    show: false,
    webPreferences: {
      // electron-vite emits an ESM preload (.mjs) because the package is
      // "type": "module"; Electron loads it as ESM given the .mjs extension.
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // nut-js loads native bindings from the preload/main side; sandbox off is
      // required for those native modules to resolve at runtime.
      sandbox: false
    }
  })

  // Avoid a white flash: reveal only once the renderer has painted.
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) void mainWindow.loadURL(devServerUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  registerIpc(() => mainWindow)
  // Start the in-process rendezvous so this machine can host without any
  // external signaling server. Harmless (and idle) when we only ever control.
  void startRendezvous()
  createWindow()

  // macOS convention: re-create a window when the dock icon is clicked and none
  // are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows close, except on macOS where apps stay resident.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
