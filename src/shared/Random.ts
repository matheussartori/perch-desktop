/**
 * Port for randomness so value objects that need entropy (e.g. SessionCode)
 * stay pure and deterministically testable.
 */
export interface RandomSource {
  /** Returns an integer in the half-open range [0, maxExclusive). */
  nextInt(maxExclusive: number): number
}

/** Production source backed by the platform CSPRNG. */
export const cryptoRandom: RandomSource = {
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new Error('maxExclusive must be positive')
    const globalCrypto = (globalThis as { crypto?: Crypto }).crypto
    if (globalCrypto?.getRandomValues) {
      // Rejection sampling to avoid modulo bias.
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive
      const buf = new Uint32Array(1)
      let x = 0
      do {
        globalCrypto.getRandomValues(buf)
        x = buf[0]!
      } while (x >= limit)
      return x % maxExclusive
    }
    // Fallback (should not happen in Electron/Node 22): non-crypto.
    return Math.floor(Math.random() * maxExclusive)
  }
}
