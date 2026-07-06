import { describe, it, expect } from 'vitest'
import { JoinSessionUseCase } from '@application/JoinSessionUseCase'
import { SessionCode } from '@domain/session/SessionCode'
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
import { unwrap } from '@shared/Result'
import { FakeSignaling, FakeTransport, fakeStream } from '../support/fakes'

const code = () => unwrap(SessionCode.create('ABCDEFGHJ'))

const setup = () => {
  const signaling = new FakeSignaling()
  const transport = new FakeTransport()
  const remoteStreams: MediaStream[] = []
  const useCase = new JoinSessionUseCase({
    signaling,
    transport,
    onRemoteStream: (s) => remoteStreams.push(s)
  })
  return { signaling, transport, remoteStreams, useCase }
}

describe('JoinSessionUseCase', () => {
  it('joins signaling as controller and opens the input data channel', async () => {
    const { signaling, transport, useCase } = setup()
    await useCase.execute(code())
    expect(signaling.joined).toEqual({ code: 'ABCDEFGHJ', role: 'controller' })
    expect(transport.createdChannels).toHaveLength(1)
  })

  it('creates exactly one offer once the host is present', async () => {
    const { signaling, useCase } = setup()
    await useCase.execute(code())

    signaling.emit({ kind: 'peer-joined', role: 'host' })
    await Promise.resolve()
    signaling.emit({ kind: 'peer-joined', role: 'host' }) // duplicate must not re-offer
    await Promise.resolve()

    const offers = signaling.sent.filter((m) => m.kind === 'offer')
    expect(offers).toEqual([{ kind: 'offer', sdp: 'fake-offer-sdp' }])
  })

  it('hands the host stream to the renderer', async () => {
    const { transport, remoteStreams, useCase } = setup()
    await useCase.execute(code())
    transport.emitRemoteStream(fakeStream())
    expect(remoteStreams).toHaveLength(1)
  })

  it('only sends input once the session is live', async () => {
    const { signaling, transport, useCase } = setup()
    const handle = await useCase.execute(code())
    const channel = transport.createdChannels[0]!
    const event: InputEvent = { type: 'pointer-move', x: 0.3, y: 0.4 }

    handle.sendInput(event) // not live yet — dropped
    expect(channel.sent).toHaveLength(0)

    signaling.emit({ kind: 'peer-joined', role: 'host' })
    transport.emitState('connected')
    handle.sendInput(event)

    expect(channel.sent).toEqual([InputEventCodec.encode(event)])
  })

  it('ends when the host leaves', async () => {
    const { signaling, useCase } = setup()
    const handle = await useCase.execute(code())
    signaling.emit({ kind: 'peer-left' })
    expect(handle.session.status).toBe('ended')
  })
})
