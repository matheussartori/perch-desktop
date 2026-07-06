import type { Unsubscribe } from '../signaling/SignalingChannel'

/** A bidirectional, ordered message channel riding the peer connection. */
export interface DataChannel {
  send(data: string): void
  onMessage(handler: (data: string) => void): Unsubscribe
  onOpen(handler: () => void): Unsubscribe
  close(): void
}

export type TransportState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

/**
 * Port: the direct peer link carrying media tracks (screen + audio) and a
 * data channel (input events). Abstracts WebRTC so the application layer
 * negotiates connections without touching RTCPeerConnection APIs, and so the
 * negotiation can be driven from either the host or controller side.
 */
export interface MediaTransport {
  /** Attach a local media stream (host: screen+audio) to be sent to the peer. */
  addLocalStream(stream: MediaStream): void
  /** Fires when the remote stream arrives (controller: the host's screen+audio). */
  onRemoteStream(handler: (stream: MediaStream) => void): Unsubscribe

  /** Open a named data channel (offerer side). */
  createDataChannel(label: string): DataChannel
  /** Receive a data channel opened by the peer (answerer side). */
  onDataChannel(handler: (channel: DataChannel) => void): Unsubscribe

  /** SDP negotiation. */
  createOffer(): Promise<string>
  createAnswer(remoteOffer: string): Promise<string>
  acceptAnswer(remoteAnswer: string): Promise<void>

  /** Trickle ICE. */
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>
  onIceCandidate(handler: (candidate: RTCIceCandidateInit) => void): Unsubscribe

  onStateChange(handler: (state: TransportState) => void): Unsubscribe
  close(): void
}
