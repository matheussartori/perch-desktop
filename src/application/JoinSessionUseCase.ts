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
  /**
   * How long to wait, after the signaling socket is up, for the host to appear
   * in the room before giving up. Guards the common "wrong/expired code" and
   * "host isn't sharing yet" cases, which would otherwise hang silently.
   */
  peerJoinTimeoutMs?: number
}

const DEFAULT_PEER_JOIN_TIMEOUT_MS = 20_000

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
    const peerJoinTimeoutMs = this.deps.peerJoinTimeoutMs ?? DEFAULT_PEER_JOIN_TIMEOUT_MS
    const session = Session.controller(code)
    const cleanups: Array<() => void> = []
    let inputChannel: DataChannel | null = null
    let moveChannel: DataChannel | null = null
    let moveChannelOpen = false
    let offered = false

    const emit = () => onStatus?.(session.status)
    emit()

    // Resolves once the host is confirmed present in the room; rejects if none
    // shows up in time (or negotiation throws). We only hand back a live handle
    // after this settles, so a bad code fails loudly instead of black-screening.
    let resolvePeer!: () => void
    let rejectPeer!: (error: Error) => void
    const peerReady = new Promise<void>((resolve, reject) => {
      resolvePeer = resolve
      rejectPeer = reject
    })
    const peerTimer = setTimeout(
      () =>
        rejectPeer(
          new Error(
            "No one answered that code. Check it's right and that the other machine has clicked Share."
          )
        ),
      peerJoinTimeoutMs
    )
    cleanups.push(() => clearTimeout(peerTimer))

    // Open the channels we will stream input over (offerer side). Discrete
    // events (clicks, keys, scroll) ride the reliable ordered channel; pointer
    // moves ride a lossy one — a lost move is superseded milliseconds later by
    // the next, so retransmitting it would only delay fresher positions.
    inputChannel = transport.createDataChannel('input')
    moveChannel = transport.createDataChannel('input-move', { lossy: true })
    cleanups.push(
      moveChannel.onOpen(() => {
        moveChannelOpen = true
      })
    )

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
        // A throw here would otherwise be an unhandled rejection with no user
        // feedback; funnel every failure into fail()/reject instead.
        try {
          switch (message.kind) {
            case 'peer-joined':
              // The host is present — begin negotiation and unblock execute().
              clearTimeout(peerTimer)
              await makeOffer()
              resolvePeer()
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
              rejectPeer(new Error(message.message))
              break
          }
        } catch (cause) {
          session.fail()
          emit()
          rejectPeer(cause instanceof Error ? cause : new Error('Negotiation failed.'))
        }
      })
    )

    await signaling.join(code.toString(), 'controller')
    emit()

    // Don't report success until the host is actually on the other end.
    try {
      await peerReady
    } catch (cause) {
      for (const c of cleanups) c()
      inputChannel?.close()
      moveChannel?.close()
      transport.close()
      signaling.close()
      throw cause
    }

    return {
      session,
      sendInput: (event: InputEvent) => {
        if (session.status !== 'live') return
        // Until the lossy channel reports open, moves fall back to reliable.
        const channel =
          event.type === 'pointer-move' && moveChannelOpen ? moveChannel : inputChannel
        channel?.send(InputEventCodec.encode(event))
      },
      stop: (reason = 'local') => {
        if (reason === 'error') session.fail()
        else session.end(reason)
        for (const c of cleanups) c()
        inputChannel?.close()
        moveChannel?.close()
        transport.close()
        signaling.close()
        emit()
      }
    }
  }
}
