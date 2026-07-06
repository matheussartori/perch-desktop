import { type Result, ok, err } from '@shared/Result'
import type { RandomSource } from '@shared/Random'

/**
 * The "perch code" — the human-shareable identity of a machine ready to be
 * controlled. Nine characters from an unambiguous alphabet (no 0/O/1/I/L),
 * shown grouped as ABC-DEF-GHJ. Value object: immutable and self-validating.
 */
export class SessionCode {
  /** Unambiguous alphabet: excludes 0 O 1 I L to survive being read aloud. */
  static readonly ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  static readonly LENGTH = 9
  private static readonly GROUP = 3

  private constructor(private readonly value: string) {}

  /** Parse user/wire input, tolerating hyphens, spaces and lower case. */
  static create(raw: string): Result<SessionCode> {
    const normalized = raw.replace(/[\s-]/g, '').toUpperCase()
    if (normalized.length !== SessionCode.LENGTH) {
      return err(`A perch code has ${SessionCode.LENGTH} characters.`)
    }
    for (const ch of normalized) {
      if (!SessionCode.ALPHABET.includes(ch)) {
        return err(`"${ch}" is not a valid perch code character.`)
      }
    }
    return ok(new SessionCode(normalized))
  }

  /** Mint a fresh random code. */
  static generate(random: RandomSource): SessionCode {
    let value = ''
    for (let i = 0; i < SessionCode.LENGTH; i++) {
      value += SessionCode.ALPHABET[random.nextInt(SessionCode.ALPHABET.length)]
    }
    return new SessionCode(value)
  }

  /** Canonical, hyphen-free form used on the wire. */
  toString(): string {
    return this.value
  }

  /** Grouped form for display: ABC-DEF-GHJ. */
  toDisplay(): string {
    const groups: string[] = []
    for (let i = 0; i < this.value.length; i += SessionCode.GROUP) {
      groups.push(this.value.slice(i, i + SessionCode.GROUP))
    }
    return groups.join('-')
  }

  equals(other: SessionCode): boolean {
    return this.value === other.value
  }
}
