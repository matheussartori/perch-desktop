/**
 * A tiny Result type so the domain can signal failure without throwing.
 * Keeps use cases explicit about the errors they must handle.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok

/** Unwrap or throw — only for call sites that have already proven success. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw new Error(`Called unwrap on an error Result: ${String(r.error)}`)
}
