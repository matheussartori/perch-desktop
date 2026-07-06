import { type Result, ok, err } from '@shared/Result'
import { SessionCode } from './SessionCode'
import type { SessionRole } from './SessionRole'
import type { SessionStatus } from './SessionStatus'
import type { SessionDomainEvent } from './events'

/**
 * Session aggregate — the single source of truth for one remote-control
 * session, seen from this machine. It owns the status machine and the codes
 * involved, guards every transition, and records domain events for the
 * application layer to act on. It holds no transport, no I/O: pure.
 */
export class Session {
  private _status: SessionStatus = 'idle'
  private readonly _events: SessionDomainEvent[] = []

  private constructor(
    private readonly _role: SessionRole,
    /** Host: the code we published. Controller: the code we dialed. */
    private readonly _code: SessionCode
  ) {}

  // --- Construction -------------------------------------------------------

  /** Begin hosting: publish a freshly generated code and wait for a dial. */
  static host(code: SessionCode): Session {
    const s = new Session('host', code)
    s.record({ kind: 'session.started', role: 'host', code: code.toString() })
    s.transition('awaiting')
    return s
  }

  /** Begin controlling: dial a host's code. */
  static controller(code: SessionCode): Session {
    const s = new Session('controller', code)
    s.record({ kind: 'session.started', role: 'controller', code: code.toString() })
    s.transition('connecting')
    return s
  }

  // --- Queries ------------------------------------------------------------

  get role(): SessionRole {
    return this._role
  }

  get status(): SessionStatus {
    return this._status
  }

  get code(): SessionCode {
    return this._code
  }

  get isActive(): boolean {
    return this._status !== 'ended' && this._status !== 'failed'
  }

  // --- Commands -----------------------------------------------------------

  /** The peer has fully connected and media is flowing. */
  markLive(): Result<void> {
    if (this._status !== 'awaiting' && this._status !== 'connecting') {
      return err(`Cannot go live from "${this._status}".`)
    }
    this.transition('live')
    return ok(undefined)
  }

  /** Graceful shutdown initiated locally or by the peer leaving. */
  end(reason: 'local' | 'remote' = 'local'): Result<void> {
    if (!this.isActive) return err('Session is already closed.')
    this.transition('ended')
    this.record({ kind: 'session.ended', reason })
    return ok(undefined)
  }

  /** Something broke (signaling lost, ICE failed, peer unreachable). */
  fail(): void {
    if (!this.isActive) return
    this.transition('failed')
    this.record({ kind: 'session.ended', reason: 'error' })
  }

  // --- Events -------------------------------------------------------------

  /** Drain recorded events; the caller becomes responsible for them. */
  pullEvents(): SessionDomainEvent[] {
    return this._events.splice(0, this._events.length)
  }

  // --- Internals ----------------------------------------------------------

  private transition(to: SessionStatus): void {
    const from = this._status
    if (from === to) return
    this._status = to
    this.record({ kind: 'session.statusChanged', from, to })
  }

  private record(event: SessionDomainEvent): void {
    this._events.push(event)
  }
}
