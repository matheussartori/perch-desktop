import { describe, it, expect } from 'vitest'
import { HostSessionUseCase } from '@application/HostSessionUseCase'
import { SessionCode } from '@domain/session/SessionCode'
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
import { unwrap } from '@shared/Result'
import {
  FakeSignaling,
  FakeTransport,
  FakeDataChannel,
  RecordingInputController,
  FakeMediaSource
} from '../support/fakes'

const code = () => unwrap(SessionCode.create('ABCDEFGHJ'))

const setup = () => {
  const signaling = new FakeSignaling()
  const transport = new FakeTransport()
  const media = new FakeMediaSource()
  const input = new RecordingInputController()
  const statuses: string[] = []
  const useCase = new HostSessionUseCase({
    signaling,
    transport,
    media,
    input,
    onStatus: (s) => statuses.push(s)
  })
  return { signaling, transport, media, input, statuses, useCase }
}

describe('HostSessionUseCase', () => {
  it('joins signaling as host with the published code', async () => {
    const { signaling, useCase } = setup()
    await useCase.execute(code())
    expect(signaling.joined).toEqual({ code: 'ABCDEFGHJ', role: 'host' })
  })

  it('captures screen+audio when a controller joins and answers its offer', async () => {
    const { signaling, transport, media, useCase } = setup()
    await useCase.execute(code())

    signaling.emit({ kind: 'peer-joined', role: 'controller' })
    await Promise.resolve() // let the async capture settle
    expect(media.captured).toBe(1)
    expect(transport.localStreams).toHaveLength(1)

    signaling.emit({ kind: 'offer', sdp: 'remote-offer' })
    await Promise.resolve()
    expect(signaling.sent).toContainEqual({ kind: 'answer', sdp: 'fake-answer-sdp' })
  })

  it('relays trickled ICE candidates to the controller', async () => {
    const { signaling, transport, useCase } = setup()
    await useCase.execute(code())
    transport.emitIce({ candidate: 'candidate:1' })
    expect(signaling.sent).toContainEqual({ kind: 'ice', candidate: { candidate: 'candidate:1' } })
  })

  it('applies input events arriving on the controller-opened data channel', async () => {
    const { transport, input, useCase } = setup()
    await useCase.execute(code())

    const channel = new FakeDataChannel()
    transport.emitDataChannel(channel)

    const event: InputEvent = { type: 'pointer-button', button: 'left', pressed: true, x: 0.1, y: 0.2 }
    channel.emitMessage(InputEventCodec.encode(event))
    await Promise.resolve()

    expect(input.applied).toEqual([event])
  })

  it('goes live when the transport connects', async () => {
    const { transport, statuses, useCase } = setup()
    const handle = await useCase.execute(code())
    transport.emitState('connected')
    expect(handle.session.status).toBe('live')
    expect(statuses).toContain('live')
  })

  it('tears down transport and signaling on stop', async () => {
    const { signaling, transport, useCase } = setup()
    const handle = await useCase.execute(code())
    handle.stop('local')
    expect(handle.session.status).toBe('ended')
    expect(transport.closed).toBe(true)
    expect(signaling.closed).toBe(true)
  })
})
