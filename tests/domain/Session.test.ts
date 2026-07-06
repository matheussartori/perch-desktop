import { describe, it, expect } from 'vitest'
import { Session } from '@domain/session/Session'
import { SessionCode } from '@domain/session/SessionCode'
import { unwrap } from '@shared/Result'

const code = () => unwrap(SessionCode.create('ABCDEFGHJ'))

describe('Session', () => {
  it('starts a host in "awaiting" and records the started event', () => {
    const s = Session.host(code())
    expect(s.role).toBe('host')
    expect(s.status).toBe('awaiting')
    const events = s.pullEvents()
    expect(events[0]).toMatchObject({ kind: 'session.started', role: 'host' })
    expect(events.some((e) => e.kind === 'session.statusChanged')).toBe(true)
  })

  it('starts a controller in "connecting"', () => {
    const s = Session.controller(code())
    expect(s.role).toBe('controller')
    expect(s.status).toBe('connecting')
  })

  it('goes live from awaiting and reports as active', () => {
    const s = Session.host(code())
    s.pullEvents()
    expect(unwrap(s.markLive())).toBeUndefined()
    expect(s.status).toBe('live')
    expect(s.isActive).toBe(true)
    expect(s.pullEvents()).toContainEqual({ kind: 'session.statusChanged', from: 'awaiting', to: 'live' })
  })

  it('refuses to go live from a terminal state', () => {
    const s = Session.controller(code())
    s.markLive()
    s.end()
    const result = s.markLive()
    expect(result.ok).toBe(false)
  })

  it('ends gracefully and records the reason', () => {
    const s = Session.controller(code())
    s.markLive()
    s.pullEvents()
    s.end('remote')
    expect(s.status).toBe('ended')
    expect(s.isActive).toBe(false)
    expect(s.pullEvents()).toContainEqual({ kind: 'session.ended', reason: 'remote' })
  })

  it('cannot end twice', () => {
    const s = Session.host(code())
    s.end()
    expect(s.end().ok).toBe(false)
  })

  it('fail() moves to failed and is idempotent on closed sessions', () => {
    const s = Session.host(code())
    s.fail()
    expect(s.status).toBe('failed')
    s.pullEvents() // drain the first failure's events
    s.fail() // second failure is a no-op: no status change, no new ended event
    expect(s.pullEvents()).toHaveLength(0)
  })

  it('drains events exactly once', () => {
    const s = Session.host(code())
    expect(s.pullEvents().length).toBeGreaterThan(0)
    expect(s.pullEvents()).toHaveLength(0)
  })
})
