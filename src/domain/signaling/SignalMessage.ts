import type { SessionRole } from '../session/SessionRole'

/**
 * Messages exchanged with the signaling server to broker a peer connection.
 * The server only relays these until a direct WebRTC link is established;
 * no media ever passes through it.
 */
export type SignalMessage =
  | { readonly kind: 'join'; readonly code: string; readonly role: SessionRole }
  | { readonly kind: 'peer-joined'; readonly role: SessionRole }
  | { readonly kind: 'peer-left' }
  | { readonly kind: 'offer'; readonly sdp: string }
  | { readonly kind: 'answer'; readonly sdp: string }
  | { readonly kind: 'ice'; readonly candidate: RTCIceCandidateInit }
  | { readonly kind: 'error'; readonly message: string }
