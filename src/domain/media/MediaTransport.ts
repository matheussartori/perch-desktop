import type { Unsubscribe } from '../signaling/SignalingChannel'

/** A bidirectional, ordered message channel riding the peer connection. */
export interface DataChannel {
  send(data: string): void
  onMessage(handler: (data: string) => void): Unsubscribe
  onOpen(handler: () => void): Unsubscribe
  close(): void
}

export interface DataChannelOptions {
  /**
   * A lossy channel drops a message instead of retransmitting it after packet
   * loss. Right for fresh-only traffic (pointer moves): a retransmitted
   * position is already stale when it lands, and waiting for it head-of-line
   * blocks every newer position behind it.
   */
  lossy?: boolean
}

/**
 * Receive-side video health, sampled between consecutive calls. Fields are
 * null until two samples exist (rates need a delta) or the stat is unknown.
 */
export type VideoReceiveStats = {
  framesPerSecond: number | null
  /** Average time a frame waited in the jitter buffer before playout (ms). */
  jitterBufferMs: number | null
  /** Average decode time per frame (ms). */
  decodeMs: number | null
  frameWidth: number | null
  frameHeight: number | null
  /** Negotiated video codec, e.g. "H264" or "VP8". */
  codec: string | null
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
  createDataChannel(label: string, options?: DataChannelOptions): DataChannel
  /** Receive a data channel opened by the peer (answerer side). */
  onDataChannel(handler: (channel: DataChannel) => void): Unsubscribe

  /** Sample incoming-video stats (controller side); null before media flows. */
  getVideoReceiveStats(): Promise<VideoReceiveStats | null>

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
