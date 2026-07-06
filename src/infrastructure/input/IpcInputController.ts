/**
 * Renderer-side InputController used by the HOST window. The host renderer
 * receives the controller's input over the data channel but cannot touch the OS
 * from the sandbox, so it forwards each event across the context bridge to the
 * main process (where NutJsInputController does the real injection).
 *
 * Fire-and-forget by design: input must never block the render loop, so we
 * hand the event off and immediately resolve.
 */
import type { InputController } from '@domain/input/InputController'
import type { InputEvent } from '@domain/input/InputEvent'

export class IpcInputController implements InputController {
  apply(event: InputEvent): Promise<void> {
    window.perch.applyInput(event)
    return Promise.resolve()
  }
}
