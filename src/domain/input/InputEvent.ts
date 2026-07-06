import { type Result, ok, err } from '@shared/Result'

/**
 * Input events are the payload the controller streams to the host over the
 * data channel. Pointer coordinates are NORMALIZED to [0,1] against the shared
 * surface, so the host maps them to its own resolution — a controller on a
 * laptop can drive a 4K host correctly.
 */
export type PointerButton = 'left' | 'right' | 'middle'

/** Modifier keys, so the host can reproduce shortcuts faithfully. */
export interface KeyModifiers {
  readonly ctrl?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
}

export type InputEvent =
  | { readonly type: 'pointer-move'; readonly x: number; readonly y: number }
  | { readonly type: 'pointer-button'; readonly button: PointerButton; readonly pressed: boolean; readonly x: number; readonly y: number }
  | { readonly type: 'pointer-scroll'; readonly dx: number; readonly dy: number }
  | { readonly type: 'key'; readonly code: string; readonly pressed: boolean; readonly modifiers: KeyModifiers }

const BUTTONS: readonly PointerButton[] = ['left', 'right', 'middle']

const isUnit = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n)

/**
 * Codec for input events. Validation lives here (not in the transport) so a
 * malformed or hostile message can never reach the OS-level input controller.
 */
export const InputEventCodec = {
  encode(event: InputEvent): string {
    return JSON.stringify(event)
  },

  decode(raw: string): Result<InputEvent> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return err('Input payload is not valid JSON.')
    }
    return InputEventCodec.fromObject(parsed)
  },

  fromObject(value: unknown): Result<InputEvent> {
    if (typeof value !== 'object' || value === null) {
      return err('Input event must be an object.')
    }
    const e = value as Record<string, unknown>
    switch (e['type']) {
      case 'pointer-move':
        if (!isUnit(e['x']) || !isUnit(e['y'])) return err('pointer-move needs normalized x/y in [0,1].')
        return ok({ type: 'pointer-move', x: e['x'], y: e['y'] })

      case 'pointer-button': {
        if (!BUTTONS.includes(e['button'] as PointerButton)) return err('Unknown pointer button.')
        if (typeof e['pressed'] !== 'boolean') return err('pointer-button needs a boolean "pressed".')
        if (!isUnit(e['x']) || !isUnit(e['y'])) return err('pointer-button needs normalized x/y in [0,1].')
        return ok({ type: 'pointer-button', button: e['button'] as PointerButton, pressed: e['pressed'], x: e['x'], y: e['y'] })
      }

      case 'pointer-scroll':
        if (!isFiniteNumber(e['dx']) || !isFiniteNumber(e['dy'])) return err('pointer-scroll needs finite dx/dy.')
        return ok({ type: 'pointer-scroll', dx: e['dx'], dy: e['dy'] })

      case 'key': {
        if (typeof e['code'] !== 'string' || e['code'].length === 0) return err('key needs a non-empty code.')
        if (typeof e['pressed'] !== 'boolean') return err('key needs a boolean "pressed".')
        const m = (typeof e['modifiers'] === 'object' && e['modifiers'] !== null ? e['modifiers'] : {}) as Record<string, unknown>
        const modifiers: KeyModifiers = {
          ctrl: m['ctrl'] === true,
          alt: m['alt'] === true,
          shift: m['shift'] === true,
          meta: m['meta'] === true
        }
        return ok({ type: 'key', code: e['code'], pressed: e['pressed'], modifiers })
      }

      default:
        return err(`Unknown input event type: ${String(e['type'])}.`)
    }
  }
}
