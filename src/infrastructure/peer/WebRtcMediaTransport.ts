/**
 * Renderer-side MediaTransport wrapping a single RTCPeerConnection. It hides all
 * WebRTC specifics behind the domain port so the use cases negotiate a session
 * from either side (host = answerer, controller = offerer) without touching
 * RTCPeerConnection directly.
 *
 * Handler registration uses Sets so multiple subscribers can observe the same
 * event; the returned Unsubscribe removes just that handler.
 */
import type { DataChannel, MediaTransport, TransportState } from '@domain/media/MediaTransport'
import type { Unsubscribe } from '@domain/signaling/SignalingChannel'

export class WebRtcMediaTransport implements MediaTransport {
  private readonly pc: RTCPeerConnection

  private readonly remoteStreamHandlers = new Set<(stream: MediaStream) => void>()
  private readonly iceHandlers = new Set<(candidate: RTCIceCandidateInit) => void>()
  private readonly stateHandlers = new Set<(state: TransportState) => void>()
  private readonly dataChannelHandlers = new Set<(channel: DataChannel) => void>()

  /** Dedupe: `ontrack` fires per track, but a stream should surface once. */
  private readonly seenStreams = new Set<MediaStream>()

  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    this.pc.ontrack = (event: RTCTrackEvent) => {
      const stream = event.streams[0]
      if (!stream || this.seenStreams.has(stream)) return
      this.seenStreams.add(stream)
      for (const handler of this.remoteStreamHandlers) handler(stream)
    }

    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      // A null candidate signals end-of-candidates; only trickle real ones.
      if (event.candidate) {
        const candidate = event.candidate.toJSON()
        for (const handler of this.iceHandlers) handler(candidate)
      }
    }

    this.pc.onconnectionstatechange = () => {
      // RTCPeerConnectionState values align 1:1 with TransportState.
      const state = this.pc.connectionState as TransportState
      for (const handler of this.stateHandlers) handler(state)
    }

    this.pc.ondatachannel = (event: RTCDataChannelEvent) => {
      const channel = this.wrapChannel(event.channel)
      for (const handler of this.dataChannelHandlers) handler(channel)
    }
  }

  addLocalStream(stream: MediaStream): void {
    // Attaching each track (not the stream) is how WebRTC negotiates senders.
    for (const track of stream.getTracks()) this.pc.addTrack(track, stream)
  }

  onRemoteStream(handler: (stream: MediaStream) => void): Unsubscribe {
    this.remoteStreamHandlers.add(handler)
    return () => this.remoteStreamHandlers.delete(handler)
  }

  createDataChannel(label: string): DataChannel {
    return this.wrapChannel(this.pc.createDataChannel(label, { ordered: true }))
  }

  onDataChannel(handler: (channel: DataChannel) => void): Unsubscribe {
    this.dataChannelHandlers.add(handler)
    return () => this.dataChannelHandlers.delete(handler)
  }

  async createOffer(): Promise<string> {
    // Offerer (controller) receives the host's media, so declare recv-only
    // transceivers up front — otherwise the host's tracks aren't negotiated.
    this.pc.addTransceiver('video', { direction: 'recvonly' })
    this.pc.addTransceiver('audio', { direction: 'recvonly' })
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    if (!offer.sdp) throw new Error('Failed to generate offer SDP.')
    return offer.sdp
  }

  async createAnswer(remoteOffer: string): Promise<string> {
    // Answerer (host) has already added its local tracks via addLocalStream.
    await this.pc.setRemoteDescription({ type: 'offer', sdp: remoteOffer })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    if (!answer.sdp) throw new Error('Failed to generate answer SDP.')
    return answer.sdp
  }

  async acceptAnswer(remoteAnswer: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: remoteAnswer })
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate)
    } catch (error) {
      // Empty/late candidates can reject harmlessly; don't break the session.
      console.warn('WebRtcMediaTransport: failed to add ICE candidate.', error)
    }
  }

  onIceCandidate(handler: (candidate: RTCIceCandidateInit) => void): Unsubscribe {
    this.iceHandlers.add(handler)
    return () => this.iceHandlers.delete(handler)
  }

  onStateChange(handler: (state: TransportState) => void): Unsubscribe {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  close(): void {
    this.pc.close()
  }

  /** Adapt a raw RTCDataChannel to the domain's DataChannel port. */
  private wrapChannel(channel: RTCDataChannel): DataChannel {
    const messageHandlers = new Set<(data: string) => void>()
    const openHandlers = new Set<() => void>()

    channel.onmessage = (event: MessageEvent) => {
      const data = event.data
      // Input events are JSON strings; ignore any binary frames.
      if (typeof data === 'string') for (const handler of messageHandlers) handler(data)
    }
    channel.onopen = () => {
      for (const handler of openHandlers) handler()
    }

    return {
      send: (data: string) => channel.send(data),
      onMessage: (handler: (data: string) => void): Unsubscribe => {
        messageHandlers.add(handler)
        return () => messageHandlers.delete(handler)
      },
      onOpen: (handler: () => void): Unsubscribe => {
        openHandlers.add(handler)
        return () => openHandlers.delete(handler)
      },
      close: () => channel.close()
    }
  }
}
