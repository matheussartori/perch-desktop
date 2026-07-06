/**
 * Renderer-side SignalingChannel over a plain browser WebSocket. It carries
 * only rendezvous/negotiation traffic (join, offer/answer, ICE) — never media
 * or input, which flow directly peer-to-peer once WebRTC is established.
 *
 * Outgoing messages are queued until the socket opens, so callers can `send`
 * without racing the connection handshake.
 */
import type { SessionRole } from '@domain/session/SessionRole'
import type { SignalingChannel, Unsubscribe } from '@domain/signaling/SignalingChannel'
import type { SignalMessage } from '@domain/signaling/SignalMessage'

const DEFAULT_SIGNAL_URL = 'ws://localhost:8787'

export class WebSocketSignalingChannel implements SignalingChannel {
  private socket: WebSocket | null = null
  private readonly handlers = new Set<(message: SignalMessage) => void>()
  /** Messages sent before `open`; flushed in order once the socket is ready. */
  private readonly outbox: string[] = []

  constructor(
    private readonly serverUrl: string = import.meta.env['VITE_SIGNAL_URL'] ?? DEFAULT_SIGNAL_URL
  ) {}

  join(code: string, role: SessionRole): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.serverUrl)
      this.socket = socket

      socket.addEventListener('open', () => {
        // Announce ourselves first, then drain anything queued before open.
        this.dispatchSend({ kind: 'join', code, role })
        this.flush()
        resolve()
      })

      socket.addEventListener('error', () => {
        reject(new Error(`Signaling connection to ${this.serverUrl} failed.`))
      })

      socket.addEventListener('message', (event: MessageEvent) => {
        this.receive(event.data)
      })
    })
  }

  send(message: SignalMessage): void {
    this.dispatchSend(message)
  }

  onMessage(handler: (message: SignalMessage) => void): Unsubscribe {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close(): void {
    this.socket?.close()
    this.socket = null
    this.handlers.clear()
  }

  /** Send now if the socket is open, otherwise queue for the next flush. */
  private dispatchSend(message: SignalMessage): void {
    const data = JSON.stringify(message)
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(data)
    else this.outbox.push(data)
  }

  private flush(): void {
    if (!this.socket) return
    while (this.outbox.length > 0) {
      const data = this.outbox.shift()
      if (data !== undefined) this.socket.send(data)
    }
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return
    let message: SignalMessage
    try {
      message = JSON.parse(raw) as SignalMessage
    } catch {
      // Ignore malformed frames rather than tearing down the session.
      return
    }
    for (const handler of this.handlers) handler(message)
  }
}
