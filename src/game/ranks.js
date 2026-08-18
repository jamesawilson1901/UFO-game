/**
 * Progression without failure. There is no way to lose and no timer, so the
 * rank ladder is what gives a young player a sense of getting somewhere —
 * every rank is reachable, the names get sillier, and the bar only ever
 * moves forward.
 */
export const RANKS = [
  { at: 0, name: 'Space Cadet' },
  { at: 500, name: 'Cow Spotter' },
  { at: 1500, name: 'Field Scout' },
  { at: 3500, name: 'Cow Wrangler' },
  { at: 7000, name: 'Beam Operator' },
  { at: 12000, name: 'Barn Raider' },
  { at: 20000, name: 'Moo Marshal' },
  { at: 32000, name: 'Abduction Ace' },
  { at: 50000, name: 'Captain Cluck' },
  { at: 75000, name: 'Herd Admiral' },
  { at: 110000, name: 'Galactic Farmer' },
  { at: 160000, name: 'Lord of the Paddock' },
  { at: 230000, name: 'Interstellar Dairy Chief' },
  { at: 330000, name: 'Emperor of Udders' },
  { at: 470000, name: 'Cosmic Cow Legend' },
  { at: 650000, name: 'Supreme Cow Commander' },
]

export function rankFor(score) {
  let index = 0
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].at) index = i
  const rank = RANKS[index]
  const next = RANKS[index + 1] ?? null
  const frac = next ? (score - rank.at) / (next.at - rank.at) : 1
  return { index, rank, next, frac: Math.max(0, Math.min(1, frac)) }
}
