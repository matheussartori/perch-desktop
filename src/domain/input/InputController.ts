import type { InputEvent } from './InputEvent'

/**
 * Port: executes validated input events against the host's actual OS.
 * The domain speaks in normalized coordinates; adapters (e.g. nut-js) map
 * them to real screen pixels and translate key codes. Only the host binds
 * a real implementation.
 */
export interface InputController {
  apply(event: InputEvent): Promise<void>
}
