/** Small deterministic PRNG (mulberry32) so a world seed rebuilds identically. */
export function makeRng(seed = 1337) {
  let a = seed >>> 0
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  r.range = (lo, hi) => lo + r() * (hi - lo)
  r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1))
  r.pick = (arr) => arr[Math.floor(r() * arr.length)]
  r.chance = (p) => r() < p
  r.sign = () => (r() < 0.5 ? -1 : 1)
  return r
}
