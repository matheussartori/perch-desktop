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
import { HostSessionUseCase, type SessionHandle } from '@application/HostSessionUseCase'
import { JoinSessionUseCase, type ControllerHandle } from '@application/JoinSessionUseCase'
import { cryptoRandom } from '@shared/Random'
import { IpcInputController } from '@infrastructure/input/IpcInputController'
import { WebSocketSignalingChannel } from '@infrastructure/signaling/WebSocketSignalingChannel'
import { WebRtcMediaTransport } from '@infrastructure/peer/WebRtcMediaTransport'
import { ScreenMediaSource } from '@infrastructure/capture/ScreenMediaSource'

export type PerchMode = 'home' | 'hosting' | 'controlling'

export type PerchController = {
  mode: PerchMode
  status: SessionStatus
  /** Display form (ABC-DEF-GHJ) of the code we published, while hosting. */
  myCode: string | null
  /** The host's screen + audio, once we are controlling and media arrives. */
  remoteStream: MediaStream | null
  error: string | null
  host: () => Promise<void>
  connect: (rawCode: string) => Promise<void>
  disconnect: () => void
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

  // The live session. Host mode keeps a SessionHandle; controller mode keeps a
  // ControllerHandle (which also carries sendInput). Held in a ref so input
  // forwarding never triggers a re-render and survives status changes.
  const hostHandle = useRef<SessionHandle | null>(null)
  const controllerHandle = useRef<ControllerHandle | null>(null)

  const host = useCallback(async () => {
    setError(null)
    const code = SessionCode.generate(cryptoRandom)
    try {
      const useCase = new HostSessionUseCase({
        signaling: new WebSocketSignalingChannel(),
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
    }
  }, [])

  const connect = useCallback(async (rawCode: string) => {
    setError(null)
    const parsed = SessionCode.create(rawCode)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    try {
      const useCase = new JoinSessionUseCase({
        signaling: new WebSocketSignalingChannel(),
        transport: new WebRtcMediaTransport(),
        onRemoteStream: setRemoteStream,
        onStatus: setStatus
      })
      const handle = await useCase.execute(parsed.value)
      controllerHandle.current = handle
      setMode('controlling')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Couldn't reach that perch code: ${cause.message}`
          : "Couldn't reach that perch code. Check it and try again."
      )
    }
  }, [])

  const disconnect = useCallback(() => {
    hostHandle.current?.stop('local')
    controllerHandle.current?.stop('local')
    hostHandle.current = null
    controllerHandle.current = null
    setMode('home')
    setStatus('idle')
    setMyCode(null)
    setRemoteStream(null)
    setError(null)
  }, [])

  const send = useCallback((event: InputEvent) => {
    controllerHandle.current?.sendInput(event)
  }, [])

  const sendPointerMove = useCallback(
    (nx: number, ny: number) => send({ type: 'pointer-move', x: unit(nx), y: unit(ny) }),
    [send]
  )

  const sendPointerButton = useCallback(
    (button: PointerButton, pressed: boolean, nx: number, ny: number) =>
      send({ type: 'pointer-button', button, pressed, x: unit(nx), y: unit(ny) }),
    [send]
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
    host,
    connect,
    disconnect,
    sendPointerMove,
    sendPointerButton,
    sendScroll,
    sendKey
  }
}
