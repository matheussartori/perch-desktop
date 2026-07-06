/**
 * Renderer-side SignalingChannel over a plain browser WebSocket. It carries
 * only rendezvous/negotiation traffic (join, offer/answer, ICE) — never media
 * or input, which flow directly peer-to-peer once WebRTC is established.
 *
 * Outgoing messages are queued until the socket opens, so callers can `send`
 * without racing the connection handshake.
 *
 * WHY connect retry/backoff: a hosted signaling server on a scale-to-zero tier
 * (e.g. Koyeb free) SLEEPS when idle and cold-starts on the next connection —
 * the first WebSocket attempt can stall or fail while the container spins up.
 * We retry with backoff (reporting progress) instead of hanging forever or
 * failing on the first miss. Retry rides on `ws:`/`wss:`, which the app CSP
 * already allows — so no HTTP wake-ping (which `connect-src` would block).
 */
import type { SessionRole } from '@domain/session/SessionRole'
import type { SignalingChannel, Unsubscribe } from '@domain/signaling/SignalingChannel'
import type { SignalMessage } from '@domain/signaling/SignalMessage'

const DEFAULT_SIGNAL_URL = 'ws://localhost:8787'

export interface SignalingConnectOptions {
  /** Per-attempt timeout (ms) before a stalled connect is abandoned and retried. */
  readonly connectTimeoutMs?: number
  /** Extra attempts after the first (0 = a single try). Covers cold-start wakeups. */
  readonly retries?: number
  /** Base backoff (ms) between attempts; grows linearly with the attempt number. */
  readonly backoffMs?: number
  /** Progress hook, 1-based attempt of `max`, so the UI can show "waking…". */
  readonly onConnecting?: (attempt: number, max: number) => void
}

const DEFAULTS = {
  connectTimeoutMs: 8000,
  retries: 0,
  backoffMs: 1000
} as const

export class WebSocketSignalingChannel implements SignalingChannel {
  private socket: WebSocket | null = null
  private readonly handlers = new Set<(message: SignalMessage) => void>()
  /** Messages sent before `open`; flushed in order once the socket is ready. */
  private readonly outbox: string[] = []
  private readonly connectTimeoutMs: number
  private readonly retries: number
  private readonly backoffMs: number
  private readonly onConnecting: ((attempt: number, max: number) => void) | undefined

  constructor(
    private readonly serverUrl: string = import.meta.env['VITE_SIGNAL_URL'] ?? DEFAULT_SIGNAL_URL,
    options: SignalingConnectOptions = {}
  ) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs
    this.retries = options.retries ?? DEFAULTS.retries
    this.backoffMs = options.backoffMs ?? DEFAULTS.backoffMs
    this.onConnecting = options.onConnecting
  }

  async join(code: string, role: SessionRole): Promise<void> {
    const max = this.retries + 1
    let lastError: unknown
    for (let attempt = 1; attempt <= max; attempt++) {
      this.onConnecting?.(attempt, max)
      try {
        await this.openOnce(code, role)
        return
      } catch (error) {
        lastError = error
        if (attempt < max) await delay(this.backoffMs * attempt)
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`Signaling connection to ${this.serverUrl} failed.`)
  }

  /** One connection attempt: resolves once open + join announced, else rejects. */
  private openOnce(code: string, role: SessionRole): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Discard any socket from a previous failed attempt before opening a new one.
      if (this.socket) {
        this.socket.onopen = this.socket.onerror = this.socket.onmessage = null
        this.socket.close()
      }
      const socket = new WebSocket(this.serverUrl)
      this.socket = socket
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.onopen = socket.onerror = socket.onmessage = null
        socket.close()
        reject(new Error(`Signaling connection to ${this.serverUrl} timed out.`))
      }, this.connectTimeoutMs)

      socket.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // Announce ourselves first, then drain anything queued before open.
        this.dispatchSend({ kind: 'join', code, role })
        this.flush()
        resolve()
      }

      socket.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`Signaling connection to ${this.serverUrl} failed.`))
      }

      socket.onmessage = (event: MessageEvent) => this.receive(event.data)
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
    if (this.socket) {
      this.socket.onopen = this.socket.onerror = this.socket.onmessage = null
      this.socket.close()
    }
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

/** A cancellation-free delay. Kept local so the channel has no timer imports. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
