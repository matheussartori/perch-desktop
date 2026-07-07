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

/**
 * `execute` resolves only once the host is confirmed present (a `peer-joined`
 * arrives), so a wrong/idle code fails loudly instead of black-screening. Since
 * the message handler is wired synchronously before `execute` first awaits, the
 * tests emit `peer-joined` right after the call, then await the returned handle.
 */
const connectHost = async (
  signaling: FakeSignaling,
  useCase: JoinSessionUseCase
): ReturnType<JoinSessionUseCase['execute']> => {
  const pending = useCase.execute(code())
  signaling.emit({ kind: 'peer-joined', role: 'host' })
  return pending
}

describe('JoinSessionUseCase', () => {
  it('joins signaling as controller and opens the input data channels', async () => {
    const { signaling, transport, useCase } = setup()
    await connectHost(signaling, useCase)
    expect(signaling.joined).toEqual({ code: 'ABCDEFGHJ', role: 'controller' })
    // Reliable channel for discrete events, lossy sibling for pointer moves.
    expect(transport.createdChannels.map((c) => c.label)).toEqual(['input', 'input-move'])
    expect(transport.createdChannels.map((c) => c.lossy)).toEqual([false, true])
  })

  it('rejects and tears down if no host joins before the timeout', async () => {
    const signaling = new FakeSignaling()
    const transport = new FakeTransport()
    const useCase = new JoinSessionUseCase({
      signaling,
      transport,
      onRemoteStream: () => {},
      peerJoinTimeoutMs: 20
    })
    await expect(useCase.execute(code())).rejects.toThrow(/No one answered/)
    expect(transport.closed).toBe(true)
    expect(signaling.closed).toBe(true)
  })

  it('creates exactly one offer once the host is present', async () => {
    const { signaling, useCase } = setup()
    await connectHost(signaling, useCase)

    signaling.emit({ kind: 'peer-joined', role: 'host' }) // duplicate must not re-offer
    await Promise.resolve()

    const offers = signaling.sent.filter((m) => m.kind === 'offer')
    expect(offers).toEqual([{ kind: 'offer', sdp: 'fake-offer-sdp' }])
  })

  it('hands the host stream to the renderer', async () => {
    const { signaling, transport, remoteStreams, useCase } = setup()
    await connectHost(signaling, useCase)
    transport.emitRemoteStream(fakeStream())
    expect(remoteStreams).toHaveLength(1)
  })

  it('only sends input once the session is live', async () => {
    const { signaling, transport, useCase } = setup()
    const handle = await connectHost(signaling, useCase)
    const channel = transport.createdChannels[0]!
    const event: InputEvent = { type: 'pointer-move', x: 0.3, y: 0.4 }

    handle.sendInput(event) // not live yet — dropped
    expect(channel.sent).toHaveLength(0)

    transport.emitState('connected')
    handle.sendInput(event)

    expect(channel.sent).toEqual([InputEventCodec.encode(event)])
  })

  it('routes pointer moves over the lossy channel once it opens', async () => {
    const { signaling, transport, useCase } = setup()
    const handle = await connectHost(signaling, useCase)
    const input = transport.createdChannels[0]!
    const moves = transport.createdChannels[1]!
    transport.emitState('connected')

    // Before the lossy channel opens, moves fall back to the reliable one.
    handle.sendInput({ type: 'pointer-move', x: 0.1, y: 0.2 })
    expect(input.sent).toHaveLength(1)
    expect(moves.sent).toHaveLength(0)

    moves.emitOpen()
    handle.sendInput({ type: 'pointer-move', x: 0.3, y: 0.4 })
    handle.sendInput({ type: 'pointer-button', button: 'left', pressed: true, x: 0.3, y: 0.4 })

    expect(moves.sent).toEqual([InputEventCodec.encode({ type: 'pointer-move', x: 0.3, y: 0.4 })])
    expect(input.sent).toHaveLength(2) // the early move + the button press
  })

  it('ends when the host leaves', async () => {
    const { signaling, useCase } = setup()
    const handle = await connectHost(signaling, useCase)
    signaling.emit({ kind: 'peer-left' })
    expect(handle.session.status).toBe('ended')
  })
})
