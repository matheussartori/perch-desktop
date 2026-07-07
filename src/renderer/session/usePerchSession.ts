/*
 * Composition root for the renderer. This hook wires the application use cases
 * to their concrete infrastructure adapters and projects the resulting session
 * lifecycle into React state. It is the ONLY place adapters are instantiated,
 * and it always builds a fresh set per session — a closed WebRTC transport can
 * never be reused. Presentational components consume the returned controller
 * via props; they know nothing about use cases or transports.
 */
import { useCallback, useRef, useState } from 'react'
import { SessionCode } from '@domain/session/SessionCode'
import type { SessionStatus } from '@domain/session/SessionStatus'
import type { InputEvent, PointerButton, KeyModifiers } from '@domain/input/InputEvent'
import type { MediaTransport, VideoReceiveStats } from '@domain/media/MediaTransport'
import { HostSessionUseCase, type SessionHandle } from '@application/HostSessionUseCase'
import { JoinSessionUseCase, type ControllerHandle } from '@application/JoinSessionUseCase'
import { cryptoRandom } from '@shared/Random'
import { RENDEZVOUS_PORT } from '@shared/bridge'
import { IpcInputController } from '@infrastructure/input/IpcInputController'
import { WebSocketSignalingChannel } from '@infrastructure/signaling/WebSocketSignalingChannel'
import { WebRtcMediaTransport } from '@infrastructure/peer/WebRtcMediaTransport'
import { ScreenMediaSource } from '@infrastructure/capture/ScreenMediaSource'

/**
 * A hosted signaling URL baked in at build time (internet deployments) wins for
 * both sides. Without it we run in LAN mode: the host dials its own in-process
 * rendezvous over loopback, and the controller dials the host's LAN address.
 */
const SIGNAL_OVERRIDE = import.meta.env['VITE_SIGNAL_URL'] as string | undefined

/**
 * Signaling dial settings. Hosted mode may hit a scale-to-zero server that
 * SLEEPS when idle, so it retries with backoff (long enough to cover a cold
 * start) and reports "waking…". LAN mode dials a live rendezvous, so a couple
 * of quick tries is enough — no point stalling on a genuinely wrong address.
 */
function connectOptions(onNotice: (text: string) => void): {
  connectTimeoutMs: number
  retries: number
  backoffMs: number
  onConnecting: (attempt: number, max: number) => void
} {
  const hosted = Boolean(SIGNAL_OVERRIDE)
  return {
    connectTimeoutMs: hosted ? 9000 : 6000,
    retries: hosted ? 5 : 1,
    backoffMs: 1200,
    onConnecting: (attempt, max) =>
      onNotice(hosted && attempt > 1 ? `Waking the server… (${attempt}/${max})` : 'Connecting…')
  }
}

export type PerchMode = 'home' | 'hosting' | 'controlling'

export type PerchController = {
  mode: PerchMode
  status: SessionStatus
  /** Display form (ABC-DEF-GHJ) of the code we published, while hosting. */
  myCode: string | null
  /** The host's screen + audio, once we are controlling and media arrives. */
  remoteStream: MediaStream | null
  error: string | null
  /** True while a host/connect attempt is in flight, for disabling the UI. */
  busy: boolean
  /** Transient progress text ("Connecting…", "Waking the server…"). */
  notice: string | null
  /**
   * Whether the Connect form needs a host address. False when a hosted signal
   * URL is baked in — pairing is then by code alone, no IP required.
   */
  needsAddress: boolean
  host: () => Promise<void>
  /** `hostAddress` is the host's LAN IP; ignored when a hosted signal URL is baked in. */
  connect: (rawCode: string, hostAddress: string) => Promise<void>
  disconnect: () => void
  /** Sample incoming-video stats while controlling (fps, jitter buffer, codec). */
  getVideoStats: () => Promise<VideoReceiveStats | null>
  sendPointerMove: (nx: number, ny: number) => void
  sendPointerButton: (button: PointerButton, pressed: boolean, nx: number, ny: number) => void
  sendScroll: (dx: number, dy: number) => void
  sendKey: (code: string, pressed: boolean, mods: KeyModifiers) => void
}

/** Clamp a coordinate into the normalized [0,1] range the codec requires. */
const unit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export function usePerchSession(): PerchController {
  const [mode, setMode] = useState<PerchMode>('home')
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [myCode, setMyCode] = useState<string | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // The live session. Host mode keeps a SessionHandle; controller mode keeps a
  // ControllerHandle (which also carries sendInput). Held in a ref so input
  // forwarding never triggers a re-render and survives status changes.
  const hostHandle = useRef<SessionHandle | null>(null)
  const controllerHandle = useRef<ControllerHandle | null>(null)

  // The controller's transport, kept (as its port) so the UI can poll
  // receive-side video stats without reaching into the use case.
  const controllerTransport = useRef<MediaTransport | null>(null)

  // Pointer-move coalescing. Raw DOM mousemove fires far faster than the host can
  // actuate (125–1000 Hz on modern mice/trackpads); sending every one floods the
  // channel with stale positions that must all be applied in order, so the cursor
  // lags further and further behind. We instead keep only the latest position and
  // flush it once per animation frame (~display refresh) — the freshest position
  // is all that matters, and discrete events (clicks/keys) still go immediately.
  const pendingMove = useRef<{ x: number; y: number } | null>(null)
  const moveFrame = useRef<number | null>(null)

  const host = useCallback(async () => {
    setError(null)
    setBusy(true)
    const code = SessionCode.generate(cryptoRandom)
    try {
      const useCase = new HostSessionUseCase({
        // Loopback to our own embedded rendezvous (LAN), unless a hosted URL is baked in.
        signaling: new WebSocketSignalingChannel(
          SIGNAL_OVERRIDE ?? `ws://127.0.0.1:${RENDEZVOUS_PORT}`,
          connectOptions(setNotice)
        ),
        transport: new WebRtcMediaTransport(),
        media: new ScreenMediaSource(),
        input: new IpcInputController(),
        onStatus: setStatus
      })
      const handle = await useCase.execute(code)
      hostHandle.current = handle
      setMyCode(code.toDisplay())
      setMode('hosting')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Couldn't start sharing: ${cause.message}`
          : "Couldn't start sharing this screen."
      )
    } finally {
      setBusy(false)
      setNotice(null)
    }
  }, [])

  const connect = useCallback(async (rawCode: string, hostAddress: string) => {
    setError(null)
    const parsed = SessionCode.create(rawCode)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const address = hostAddress.trim()
    if (!SIGNAL_OVERRIDE && address.length === 0) {
      setError("Enter the host's address (shown on the sharing machine).")
      return
    }
    setBusy(true)
    try {
      const transport = new WebRtcMediaTransport()
      const useCase = new JoinSessionUseCase({
        // Dial the host's LAN rendezvous, unless a hosted URL is baked in.
        signaling: new WebSocketSignalingChannel(
          SIGNAL_OVERRIDE ?? `ws://${address}:${RENDEZVOUS_PORT}`,
          connectOptions(setNotice)
        ),
        transport,
        onRemoteStream: setRemoteStream,
        onStatus: setStatus
      })
      const handle = await useCase.execute(parsed.value)
      controllerHandle.current = handle
      controllerTransport.current = transport
      setMode('controlling')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Couldn't reach that perch code: ${cause.message}`
          : "Couldn't reach that perch code. Check it and try again."
      )
    } finally {
      setBusy(false)
      setNotice(null)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (moveFrame.current !== null) {
      cancelAnimationFrame(moveFrame.current)
      moveFrame.current = null
    }
    pendingMove.current = null
    hostHandle.current?.stop('local')
    controllerHandle.current?.stop('local')
    hostHandle.current = null
    controllerHandle.current = null
    controllerTransport.current = null
    setMode('home')
    setStatus('idle')
    setMyCode(null)
    setRemoteStream(null)
    setError(null)
    setBusy(false)
    setNotice(null)
  }, [])

  const send = useCallback((event: InputEvent) => {
    controllerHandle.current?.sendInput(event)
  }, [])

  const getVideoStats = useCallback(
    () => controllerTransport.current?.getVideoReceiveStats() ?? Promise.resolve(null),
    []
  )

  // Drop any buffered pointer-move without sending it. Called before a discrete
  // event (click/scroll) that carries its own coordinates, so the stale move
  // can't land after it and yank the cursor back.
  const cancelPendingMove = useCallback(() => {
    if (moveFrame.current !== null) {
      cancelAnimationFrame(moveFrame.current)
      moveFrame.current = null
    }
    pendingMove.current = null
  }, [])

  const flushMove = useCallback(() => {
    moveFrame.current = null
    const p = pendingMove.current
    if (!p) return
    pendingMove.current = null
    send({ type: 'pointer-move', x: p.x, y: p.y })
  }, [send])

  const sendPointerMove = useCallback(
    (nx: number, ny: number) => {
      pendingMove.current = { x: unit(nx), y: unit(ny) }
      if (moveFrame.current === null) moveFrame.current = requestAnimationFrame(flushMove)
    },
    [flushMove]
  )

  const sendPointerButton = useCallback(
    (button: PointerButton, pressed: boolean, nx: number, ny: number) => {
      // The button event carries the current position, so any buffered move is
      // redundant — drop it to keep ordering tight.
      cancelPendingMove()
      send({ type: 'pointer-button', button, pressed, x: unit(nx), y: unit(ny) })
    },
    [send, cancelPendingMove]
  )

  const sendScroll = useCallback(
    (dx: number, dy: number) => send({ type: 'pointer-scroll', dx, dy }),
    [send]
  )

  const sendKey = useCallback(
    (code: string, pressed: boolean, mods: KeyModifiers) =>
      send({ type: 'key', code, pressed, modifiers: mods }),
    [send]
  )

  return {
    mode,
    status,
    myCode,
    remoteStream,
    error,
    busy,
    notice,
    needsAddress: !SIGNAL_OVERRIDE,
    host,
    connect,
    disconnect,
    getVideoStats,
    sendPointerMove,
    sendPointerButton,
    sendScroll,
    sendKey
  }
}
