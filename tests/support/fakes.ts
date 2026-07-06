import type { SignalingChannel, Unsubscribe } from '@domain/signaling/SignalingChannel'
import type { SignalMessage } from '@domain/signaling/SignalMessage'
import type { SessionRole } from '@domain/session/SessionRole'
import type { DataChannel, MediaTransport, TransportState } from '@domain/media/MediaTransport'
import type { InputController } from '@domain/input/InputController'
import type { InputEvent } from '@domain/input/InputEvent'
import type { MediaSource } from '@application/ports'

/** In-memory signaling channel whose `emit` simulates the peer/server. */
export class FakeSignaling implements SignalingChannel {
  joined: { code: string; role: SessionRole } | null = null
  readonly sent: SignalMessage[] = []
  closed = false
  private handlers: Array<(m: SignalMessage) => void> = []

  async join(code: string, role: SessionRole): Promise<void> {
    this.joined = { code, role }
  }
  send(message: SignalMessage): void {
    this.sent.push(message)
  }
  onMessage(handler: (m: SignalMessage) => void): Unsubscribe {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }
  close(): void {
    this.closed = true
  }
  /** Test helper: deliver a message as if it came from the peer. */
  emit(message: SignalMessage): void {
    for (const h of [...this.handlers]) h(message)
  }
}

/** In-memory data channel with drivable message delivery. */
export class FakeDataChannel implements DataChannel {
  readonly sent: string[] = []
  closed = false
  private messageHandlers: Array<(d: string) => void> = []
  private openHandlers: Array<() => void> = []

  send(data: string): void {
    this.sent.push(data)
  }
  onMessage(handler: (d: string) => void): Unsubscribe {
    this.messageHandlers.push(handler)
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler)
    }
  }
  onOpen(handler: () => void): Unsubscribe {
    this.openHandlers.push(handler)
    return () => {
      this.openHandlers = this.openHandlers.filter((h) => h !== handler)
    }
  }
  close(): void {
    this.closed = true
  }
  emitMessage(data: string): void {
    for (const h of [...this.messageHandlers]) h(data)
  }
  emitOpen(): void {
    for (const h of [...this.openHandlers]) h()
  }
}

/** Scriptable transport recording all interactions. */
export class FakeTransport implements MediaTransport {
  localStreams: MediaStream[] = []
  createdChannels: FakeDataChannel[] = []
  closed = false
  private remoteStreamHandlers: Array<(s: MediaStream) => void> = []
  private dataChannelHandlers: Array<(c: DataChannel) => void> = []
  private iceHandlers: Array<(c: RTCIceCandidateInit) => void> = []
  private stateHandlers: Array<(s: TransportState) => void> = []

  addLocalStream(stream: MediaStream): void {
    this.localStreams.push(stream)
  }
  onRemoteStream(handler: (s: MediaStream) => void): Unsubscribe {
    this.remoteStreamHandlers.push(handler)
    return () => void 0
  }
  createDataChannel(_label: string): DataChannel {
    const c = new FakeDataChannel()
    this.createdChannels.push(c)
    return c
  }
  onDataChannel(handler: (c: DataChannel) => void): Unsubscribe {
    this.dataChannelHandlers.push(handler)
    return () => void 0
  }
  async createOffer(): Promise<string> {
    return 'fake-offer-sdp'
  }
  async createAnswer(_remoteOffer: string): Promise<string> {
    return 'fake-answer-sdp'
  }
  async acceptAnswer(_remoteAnswer: string): Promise<void> {}
  async addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {}
  onIceCandidate(handler: (c: RTCIceCandidateInit) => void): Unsubscribe {
    this.iceHandlers.push(handler)
    return () => void 0
  }
  onStateChange(handler: (s: TransportState) => void): Unsubscribe {
    this.stateHandlers.push(handler)
    return () => void 0
  }
  close(): void {
    this.closed = true
  }
  // --- drivers ---
  emitRemoteStream(stream: MediaStream): void {
    for (const h of this.remoteStreamHandlers) h(stream)
  }
  emitDataChannel(channel: DataChannel): void {
    for (const h of this.dataChannelHandlers) h(channel)
  }
  emitIce(candidate: RTCIceCandidateInit): void {
    for (const h of this.iceHandlers) h(candidate)
  }
  emitState(state: TransportState): void {
    for (const h of this.stateHandlers) h(state)
  }
}

/** Records every applied input event. */
export class RecordingInputController implements InputController {
  readonly applied: InputEvent[] = []
  async apply(event: InputEvent): Promise<void> {
    this.applied.push(event)
  }
}

/** Media source that hands back a stand-in stream. */
export class FakeMediaSource implements MediaSource {
  captured = 0
  async capture(): Promise<MediaStream> {
    this.captured++
    return {} as unknown as MediaStream
  }
}

export const fakeStream = (): MediaStream => ({}) as unknown as MediaStream
