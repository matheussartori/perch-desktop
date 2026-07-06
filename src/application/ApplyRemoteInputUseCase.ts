import { InputEventCodec } from '@domain/input/InputEvent'
import type { InputController } from '@domain/input/InputController'
import { type Result, ok, err } from '@shared/Result'

/**
 * Host-side: turn a raw data-channel payload into a validated input event and
 * apply it to the OS. Validation is enforced here so a malformed or hostile
 * message is dropped before it reaches the input controller.
 */
export class ApplyRemoteInputUseCase {
  constructor(private readonly controller: InputController) {}

  async execute(rawPayload: string): Promise<Result<void>> {
    const decoded = InputEventCodec.decode(rawPayload)
    if (!decoded.ok) return err(decoded.error)
    try {
      await this.controller.apply(decoded.value)
      return ok(undefined)
    } catch (cause) {
      return err(`Failed to apply input: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
}
