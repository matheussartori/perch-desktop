import { describe, it, expect } from 'vitest'
import { ApplyRemoteInputUseCase } from '@application/ApplyRemoteInputUseCase'
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
import { RecordingInputController } from '../support/fakes'

describe('ApplyRemoteInputUseCase', () => {
  it('decodes a valid payload and applies it', async () => {
    const controller = new RecordingInputController()
    const useCase = new ApplyRemoteInputUseCase(controller)
    const event: InputEvent = { type: 'pointer-move', x: 0.5, y: 0.5 }

    const result = await useCase.execute(InputEventCodec.encode(event))

    expect(result.ok).toBe(true)
    expect(controller.applied).toEqual([event])
  })

  it('drops malformed payloads without touching the controller', async () => {
    const controller = new RecordingInputController()
    const useCase = new ApplyRemoteInputUseCase(controller)

    const result = await useCase.execute('{ hostile')

    expect(result.ok).toBe(false)
    expect(controller.applied).toHaveLength(0)
  })

  it('rejects out-of-range coordinates before they reach the OS', async () => {
    const controller = new RecordingInputController()
    const useCase = new ApplyRemoteInputUseCase(controller)

    const result = await useCase.execute(JSON.stringify({ type: 'pointer-move', x: 9, y: 9 }))

    expect(result.ok).toBe(false)
    expect(controller.applied).toHaveLength(0)
  })

  it('surfaces controller failures as an error result', async () => {
    const failing = { apply: async () => { throw new Error('accessibility denied') } }
    const useCase = new ApplyRemoteInputUseCase(failing)

    const result = await useCase.execute(JSON.stringify({ type: 'pointer-move', x: 0, y: 0 }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('accessibility denied')
  })
})
