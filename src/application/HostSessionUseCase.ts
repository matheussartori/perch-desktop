import { Session } from '@domain/session/Session'
import type { SessionCode } from '@domain/session/SessionCode'
import type { SignalingChannel } from '@domain/signaling/SignalingChannel'
import type { MediaTransport } from '@domain/media/MediaTransport'
import type { InputController } from '@domain/input/InputController'
import { ApplyRemoteInputUseCase } from './ApplyRemoteInputUseCase'
import type { MediaSource, StatusListener } from './ports'

export interface HostSessionDeps {
  signaling: SignalingChannel
  transport: MediaTransport
  media: MediaSource
  /** Executes input the controller sends us. */
  input: InputController
  onStatus?: StatusListener
}

export interface SessionHandle {
  readonly session: Session
  /** Tear down transport + signaling and end the session. */
  stop(reason?: 'local' | 'remote' | 'error'): void
}

/**
 * Start hosting: publish our code and, once a controller dials in, answer its
 * offer, stream our screen + audio, and apply the input it sends. The host is
 * always the answerer — the controller drives negotiation — which keeps SDP
 * exchange deterministic and free of glare.
 */
export class HostSessionUseCase {
  constructor(private readonly deps: HostSessionDeps) {}

  async execute(code: SessionCode): Promise<SessionHandle> {
    const { signaling, transport, media, input, onStatus } = this.deps
    const session = Session.host(code)
    const applyInput = new ApplyRemoteInputUseCase(input)
    const cleanups: Array<() => void> = []

    const emit = () => onStatus?.(session.status)
    emit()

    // Trickle our ICE candidates to the controller.
    cleanups.push(transport.onIceCandidate((candidate) => signaling.send({ kind: 'ice', candidate })))

    // The controller opens the "input" data channel; every message is a
    // validated input event we apply to this machine.
    cleanups.push(
      transport.onDataChannel((channel) => {
        channel.onMessage((data) => void applyInput.execute(data))
      })
    )

    cleanups.push(
      transport.onStateChange((state) => {
        if (state === 'connected') session.markLive()
        else if (state === 'failed') session.fail()
        else if (state === 'disconnected' || state === 'closed') session.end('remote')
        emit()
      })
    )

    cleanups.push(
      signaling.onMessage(async (message) => {
        // A throw here (capture denied, SDP failure) would be an unhandled
        // rejection; surface it as a failed session instead.
        try {
          switch (message.kind) {
            case 'peer-joined': {
              // A controller arrived: attach our screen+audio so the tracks are
              // present in the answer we are about to produce.
              const stream = await media.capture()
              transport.addLocalStream(stream)
              break
            }
            case 'offer': {
              const answer = await transport.createAnswer(message.sdp)
              signaling.send({ kind: 'answer', sdp: answer })
              break
            }
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
        } catch (cause) {
          console.error('[perch] host negotiation failed:', cause)
          session.fail()
          emit()
        }
      })
    )

    await signaling.join(code.toString(), 'host')
    emit()

    return {
      session,
      stop: (reason = 'local') => {
        if (reason === 'error') session.fail()
        else session.end(reason)
        for (const c of cleanups) c()
        transport.close()
        signaling.close()
        emit()
      }
    }
  }
}
