import { Session } from '@domain/session/Session'
import type { SessionCode } from '@domain/session/SessionCode'
import type { SignalingChannel } from '@domain/signaling/SignalingChannel'
import type { MediaTransport, DataChannel } from '@domain/media/MediaTransport'
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
import type { StatusListener } from './ports'
import type { SessionHandle } from './HostSessionUseCase'

export interface JoinSessionDeps {
  signaling: SignalingChannel
  transport: MediaTransport
  /** Called with the host's screen + audio stream to render. */
  onRemoteStream: (stream: MediaStream) => void
  onStatus?: StatusListener
}

export interface ControllerHandle extends SessionHandle {
  /** Send a validated input event to the host over the data channel. */
  sendInput: (event: InputEvent) => void
}

/**
 * Dial a host and take control. The controller is the offerer: it opens the
 * "input" data channel, adds recv-only media, and creates the offer as soon as
 * it learns the host is present. Incoming media is handed to `onRemoteStream`.
 */
export class JoinSessionUseCase {
  constructor(private readonly deps: JoinSessionDeps) {}

  async execute(code: SessionCode): Promise<ControllerHandle> {
    const { signaling, transport, onRemoteStream, onStatus } = this.deps
    const session = Session.controller(code)
    const cleanups: Array<() => void> = []
    let inputChannel: DataChannel | null = null
    let offered = false

    const emit = () => onStatus?.(session.status)
    emit()

    // Open the channel we will stream input over (offerer side).
    inputChannel = transport.createDataChannel('input')

    cleanups.push(transport.onRemoteStream(onRemoteStream))
    cleanups.push(transport.onIceCandidate((candidate) => signaling.send({ kind: 'ice', candidate })))

    cleanups.push(
      transport.onStateChange((state) => {
        if (state === 'connected') session.markLive()
        else if (state === 'failed') session.fail()
        else if (state === 'disconnected' || state === 'closed') session.end('remote')
        emit()
      })
    )

    const makeOffer = async () => {
      if (offered) return
      offered = true
      const offer = await transport.createOffer()
      signaling.send({ kind: 'offer', sdp: offer })
    }

    cleanups.push(
      signaling.onMessage(async (message) => {
        switch (message.kind) {
          case 'peer-joined':
            // The host is present — begin negotiation.
            await makeOffer()
            break
          case 'answer':
            await transport.acceptAnswer(message.sdp)
            break
          case 'ice':
            await transport.addIceCandidate(message.candidate)
            break
          case 'peer-left':
            session.end('remote')
            emit()
            break
          case 'error':
            session.fail()
            emit()
            break
        }
      })
    )

    await signaling.join(code.toString(), 'controller')
    emit()

    return {
      session,
      sendInput: (event: InputEvent) => {
        if (session.status === 'live') inputChannel?.send(InputEventCodec.encode(event))
      },
      stop: (reason = 'local') => {
        if (reason === 'error') session.fail()
        else session.end(reason)
        for (const c of cleanups) c()
        inputChannel?.close()
        transport.close()
        signaling.close()
        emit()
      }
    }
  }
}
