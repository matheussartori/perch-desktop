/**
 * Renderer-side MediaTransport wrapping a single RTCPeerConnection. It hides all
 * WebRTC specifics behind the domain port so the use cases negotiate a session
 * from either side (host = answerer, controller = offerer) without touching
 * RTCPeerConnection directly.
 *
 * Handler registration uses Sets so multiple subscribers can observe the same
 * event; the returned Unsubscribe removes just that handler.
 */
import type {
  DataChannel,
  DataChannelOptions,
  MediaTransport,
  TransportState,
  VideoReceiveStats
} from '@domain/media/MediaTransport'
import type { Unsubscribe } from '@domain/signaling/SignalingChannel'

/**
 * ICE servers are baked in at build time so a release can point at a TURN relay
 * — required for peers on different NATs/firewalls — without a code change.
 * `VITE_ICE_SERVERS` is a JSON array of RTCIceServer. Absent or malformed falls
 * back to Google STUN only, which suffices on a shared LAN but NOT across the
 * public internet, where a symmetric NAT will drop the peer-to-peer connection.
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

/**
 * Encoder bitrate ceiling for the screen track. Explicit so bandwidth
 * estimation ramps to a steady target instead of hunting; 8 Mbps comfortably
 * carries 1080p60 screen content over a LAN.
 */
const MAX_VIDEO_BITRATE_BPS = 8_000_000

/**
 * Ask the receive side to render frames as soon as they arrive instead of
 * smoothing them through the default jitter buffer — the single largest
 * controller-side latency saving (~90ms typical). `jitterBufferTarget` is the
 * standard knob; `playoutDelayHint` is its Chromium predecessor and is what
 * flips the renderer onto its low-latency video path. Neither is in the DOM
 * typings yet, hence the cast. Trade-off: on a jittery link this prefers
 * stutter over lag — the right call for interactive control.
 */
function tuneReceiverForLowDelay(receiver: RTCRtpReceiver): void {
  const tunable = receiver as RTCRtpReceiver & {
    jitterBufferTarget?: number | null
    playoutDelayHint?: number | null
  }
  try {
    tunable.jitterBufferTarget = 0
    tunable.playoutDelayHint = 0
  } catch {
    // Runtime without these knobs — defaults still work, just with more delay.
  }
}

/**
 * Put H.264 first in the offer so the host encodes with the platform hardware
 * encoder (VideoToolbox / MediaFoundation) when available — lower per-frame
 * encode time and far less CPU than the default software VP8. The rest of the
 * capability list stays in the offer, so negotiation still succeeds when
 * either side lacks H.264.
 */
function preferHardwareVideoCodecs(transceiver: RTCRtpTransceiver): void {
  const caps = RTCRtpReceiver.getCapabilities?.('video')
  if (!caps || caps.codecs.length === 0) return
  const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264')
  if (h264.length === 0) return
  const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264')
  try {
    transceiver.setCodecPreferences([...h264, ...rest])
  } catch (error) {
    console.warn('WebRtcMediaTransport: could not set codec preferences.', error)
  }
}

/** Counters sampled from inbound-rtp to turn cumulative totals into rates. */
type InboundSample = {
  timestamp: number
  framesDecoded: number
  jitterBufferDelay: number
  jitterBufferEmittedCount: number
  totalDecodeTime: number
}

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)

function resolveIceServers(): RTCIceServer[] {
  const raw = import.meta.env['VITE_ICE_SERVERS']
  if (!raw) return DEFAULT_ICE_SERVERS
  try {
    const parsed = JSON.parse(raw) as RTCIceServer[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS
  } catch {
    console.warn('[perch] VITE_ICE_SERVERS is not valid JSON; using STUN only.')
    return DEFAULT_ICE_SERVERS
  }
}

export class WebRtcMediaTransport implements MediaTransport {
  private readonly pc: RTCPeerConnection

  private readonly remoteStreamHandlers = new Set<(stream: MediaStream) => void>()
  private readonly iceHandlers = new Set<(candidate: RTCIceCandidateInit) => void>()
  private readonly stateHandlers = new Set<(state: TransportState) => void>()
  private readonly dataChannelHandlers = new Set<(channel: DataChannel) => void>()

  /** Dedupe: `ontrack` fires per track, but a stream should surface once. */
  private readonly seenStreams = new Set<MediaStream>()

  /** Previous inbound-rtp sample, so getVideoReceiveStats can report rates. */
  private lastInbound: InboundSample | null = null

  constructor(iceServers: RTCIceServer[] = resolveIceServers()) {
    this.pc = new RTCPeerConnection({ iceServers })

    this.pc.ontrack = (event: RTCTrackEvent) => {
      tuneReceiverForLowDelay(event.receiver)
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

  createDataChannel(label: string, options?: DataChannelOptions): DataChannel {
    // Lossy = ordered but never retransmitted (maxRetransmits: 0): a dropped
    // packet is skipped instead of head-of-line blocking newer messages.
    const init: RTCDataChannelInit = options?.lossy
      ? { ordered: true, maxRetransmits: 0 }
      : { ordered: true }
    return this.wrapChannel(this.pc.createDataChannel(label, init))
  }

  onDataChannel(handler: (channel: DataChannel) => void): Unsubscribe {
    this.dataChannelHandlers.add(handler)
    return () => this.dataChannelHandlers.delete(handler)
  }

  async createOffer(): Promise<string> {
    // Offerer (controller) receives the host's media, so declare recv-only
    // transceivers up front — otherwise the host's tracks aren't negotiated.
    const video = this.pc.addTransceiver('video', { direction: 'recvonly' })
    this.pc.addTransceiver('audio', { direction: 'recvonly' })
    preferHardwareVideoCodecs(video)
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
    // Sender encodings only exist once the local description is set.
    this.tuneVideoSenders()
    if (!answer.sdp) throw new Error('Failed to generate answer SDP.')
    return answer.sdp
  }

  /**
   * Host-side encoder policy: under load, sacrifice resolution before frame
   * rate — a laggy cursor hurts remote control more than briefly soft text —
   * and cap the bitrate so bandwidth estimation settles instead of hunting.
   */
  private tuneVideoSenders(): void {
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      const params = sender.getParameters()
      params.degradationPreference = 'maintain-framerate'
      const encoding = params.encodings[0]
      if (encoding) encoding.maxBitrate = MAX_VIDEO_BITRATE_BPS
      sender.setParameters(params).catch((error: unknown) => {
        // Non-fatal: the stream still flows on Chromium's default policy.
        console.warn('WebRtcMediaTransport: failed to tune video sender.', error)
      })
    }
  }

  async getVideoReceiveStats(): Promise<VideoReceiveStats | null> {
    const receiver = this.pc.getReceivers().find((r) => r.track.kind === 'video')
    if (!receiver) return null
    let report: RTCStatsReport
    try {
      report = await receiver.getStats()
    } catch {
      return null // Connection closing/closed — nothing to report.
    }

    const entries = new Map<string, Record<string, unknown>>()
    report.forEach((value: Record<string, unknown>, key: string) => entries.set(key, value))
    let inbound: Record<string, unknown> | null = null
    for (const entry of entries.values()) {
      if (entry['type'] === 'inbound-rtp') {
        inbound = entry
        break
      }
    }
    if (!inbound) return null

    const sample: InboundSample = {
      timestamp: num(inbound['timestamp']) ?? 0,
      framesDecoded: num(inbound['framesDecoded']) ?? 0,
      jitterBufferDelay: num(inbound['jitterBufferDelay']) ?? 0,
      jitterBufferEmittedCount: num(inbound['jitterBufferEmittedCount']) ?? 0,
      totalDecodeTime: num(inbound['totalDecodeTime']) ?? 0
    }
    const prev = this.lastInbound
    this.lastInbound = sample

    const codecId = inbound['codecId']
    const codecEntry = typeof codecId === 'string' ? entries.get(codecId) : undefined
    const mime = codecEntry?.['mimeType']

    const stats: VideoReceiveStats = {
      framesPerSecond: null,
      jitterBufferMs: null,
      decodeMs: null,
      frameWidth: num(inbound['frameWidth']),
      frameHeight: num(inbound['frameHeight']),
      codec: typeof mime === 'string' ? mime.replace(/^video\//i, '') : null
    }

    // Cumulative counters → rates over the window since the previous call.
    if (prev && sample.timestamp > prev.timestamp) {
      const seconds = (sample.timestamp - prev.timestamp) / 1000
      const frames = sample.framesDecoded - prev.framesDecoded
      const emitted = sample.jitterBufferEmittedCount - prev.jitterBufferEmittedCount
      if (frames > 0) {
        stats.framesPerSecond = frames / seconds
        stats.decodeMs = ((sample.totalDecodeTime - prev.totalDecodeTime) / frames) * 1000
      }
      if (emitted > 0) {
        stats.jitterBufferMs = ((sample.jitterBufferDelay - prev.jitterBufferDelay) / emitted) * 1000
      }
    }
    return stats
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
