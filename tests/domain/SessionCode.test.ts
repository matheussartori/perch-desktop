import { describe, it, expect } from 'vitest'
import { SessionCode } from '@domain/session/SessionCode'
import type { RandomSource } from '@shared/Random'

/** Deterministic source that walks a fixed sequence of indices. */
const seeded = (indices: number[]): RandomSource => {
  let i = 0
  return { nextInt: () => indices[i++ % indices.length]! }
}

describe('SessionCode', () => {
  it('generates a 9-character code and displays it grouped', () => {
    const code = SessionCode.generate(seeded([0])) // all 'A'
    expect(code.toString()).toBe('AAAAAAAAA')
    expect(code.toDisplay()).toBe('AAA-AAA-AAA')
  })

  it('parses input tolerating hyphens, spaces and lower case', () => {
    const parsed = SessionCode.create(' abc-def-ghj ')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.toString()).toBe('ABCDEFGHJ')
      expect(parsed.value.toDisplay()).toBe('ABC-DEF-GHJ')
    }
  })

  it('rejects codes of the wrong length', () => {
    const parsed = SessionCode.create('ABC')
    expect(parsed.ok).toBe(false)
  })

  it('rejects ambiguous characters that are not in the alphabet', () => {
    // 0, O, 1, I, L are excluded on purpose.
    const parsed = SessionCode.create('ABCDEF0IL')
    expect(parsed.ok).toBe(false)
  })

  it('treats codes with equal characters as equal regardless of formatting', () => {
    const a = SessionCode.create('ABCDEFGHJ')
    const b = SessionCode.create('abc-def-ghj')
    expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true)
  })

  it('only ever emits characters from its alphabet', () => {
    const source = seeded([0, 5, 10, 15, 20, 25, 30, 3, 8])
    const code = SessionCode.generate(source)
    for (const ch of code.toString()) {
      expect(SessionCode.ALPHABET).toContain(ch)
    }
  })
})
