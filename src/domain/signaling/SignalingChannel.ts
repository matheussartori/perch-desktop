import type { SessionRole } from '../session/SessionRole'
import type { SignalMessage } from './SignalMessage'

export type Unsubscribe = () => void

/**
 * Port: the rendezvous channel used to negotiate a peer connection for a
 * given code. Implementations (WebSocket, and later a P2P/DHT variant) only
 * carry signaling — never media or input.
 */
export interface SignalingChannel {
  /** Join the room for `code` in the given role and start relaying. */
  join(code: string, role: SessionRole): Promise<void>
  /** Relay a message to the other side of the room. */
  send(message: SignalMessage): void
  /** Subscribe to messages from the peer/server. */
  onMessage(handler: (message: SignalMessage) => void): Unsubscribe
  /** Leave the room and release the connection. */
  close(): void
}
