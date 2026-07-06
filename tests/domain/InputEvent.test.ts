import { describe, it, expect } from 'vitest'
import { InputEventCodec, type InputEvent } from '@domain/input/InputEvent'
import { unwrap } from '@shared/Result'

describe('InputEventCodec', () => {
  it('round-trips a pointer-move', () => {
    const event: InputEvent = { type: 'pointer-move', x: 0.25, y: 0.75 }
    const decoded = unwrap(InputEventCodec.decode(InputEventCodec.encode(event)))
    expect(decoded).toEqual(event)
  })

  it('round-trips a key event with modifiers', () => {
    const event: InputEvent = {
      type: 'key',
      code: 'KeyC',
      pressed: true,
      modifiers: { ctrl: false, alt: false, shift: false, meta: true }
    }
    const decoded = unwrap(InputEventCodec.decode(InputEventCodec.encode(event)))
    expect(decoded).toEqual(event)
  })

  it('rejects pointer coordinates outside [0,1]', () => {
    const result = InputEventCodec.fromObject({ type: 'pointer-move', x: 1.5, y: 0 })
    expect(result.ok).toBe(false)
  })

  it('rejects unknown pointer buttons', () => {
    const result = InputEventCodec.fromObject({ type: 'pointer-button', button: 'thumb', pressed: true, x: 0, y: 0 })
    expect(result.ok).toBe(false)
  })

  it('rejects non-finite scroll deltas', () => {
    const result = InputEventCodec.fromObject({ type: 'pointer-scroll', dx: Infinity, dy: 0 })
    expect(result.ok).toBe(false)
  })

  it('rejects malformed JSON', () => {
    expect(InputEventCodec.decode('{ not json').ok).toBe(false)
  })

  it('rejects unknown event types', () => {
    expect(InputEventCodec.fromObject({ type: 'teleport' }).ok).toBe(false)
  })

  it('normalizes missing modifiers to all-false', () => {
    const decoded = unwrap(InputEventCodec.fromObject({ type: 'key', code: 'Enter', pressed: false }))
    if (decoded.type === 'key') {
      expect(decoded.modifiers).toEqual({ ctrl: false, alt: false, shift: false, meta: false })
    }
  })
})
