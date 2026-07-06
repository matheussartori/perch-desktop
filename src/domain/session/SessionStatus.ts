/**
 * Lifecycle of a session from this machine's point of view.
 *
 *   idle ──▶ awaiting ─┐          (host: published code, waiting for a dial)
 *   idle ──▶ connecting ┼─▶ live ─▶ ended
 *                       │
 *   (any) ─────────────▶└─▶ failed
 */
export type SessionStatus =
  | 'idle'
  | 'awaiting'
  | 'connecting'
  | 'live'
  | 'ended'
  | 'failed'
