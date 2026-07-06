import type { DomainEvent } from '@shared/DomainEvent'
import type { SessionRole } from './SessionRole'
import type { SessionStatus } from './SessionStatus'

export interface SessionStarted extends DomainEvent {
  readonly kind: 'session.started'
  readonly role: SessionRole
  /** Present for hosts (the published code) and controllers (the dialed code). */
  readonly code: string
}

export interface SessionStatusChanged extends DomainEvent {
  readonly kind: 'session.statusChanged'
  readonly from: SessionStatus
  readonly to: SessionStatus
}

export interface SessionEnded extends DomainEvent {
  readonly kind: 'session.ended'
  readonly reason: 'local' | 'remote' | 'error'
}

export type SessionDomainEvent =
  | SessionStarted
  | SessionStatusChanged
  | SessionEnded
