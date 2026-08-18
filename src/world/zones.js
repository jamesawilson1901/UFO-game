/**
 * The world is a 480×480 square divided into four themed districts around a
 * central meadow. Zones are soft circles: their influence falls off with
 * distance so ground colour and spawn tables blend at the borders instead of
 * snapping.
 */
export const WORLD = {
  size: 480,
  half: 240,
  seaLevel: -1.6,
}

export const ZONES = [
  {
    id: 'farm',
    name: 'Sunnyside Farm',
    at: [-118, -118],
    radius: 130,
    ground: 0x9ccc5a,
    music: 'assets/audio/music/farm.ogg',
    critters: { cow: 26, calf: 10, pig: 10, sheep: 12, chicken: 14, bull: 3 },
    npcs: 6,
  },
  {
    id: 'medical',
    name: 'St. Bovine Hospital',
    at: [124, -124],
    radius: 122,
    ground: 0xc9d6cf,
    music: 'assets/audio/music/medical.ogg',
    critters: { chicken: 4, cow: 4 },
    npcs: 16,
  },
  {
    id: 'pirate',
    name: 'Rotten Cove',
    at: [-124, 124],
    radius: 132,
    ground: 0xe3d3a0,
    music: 'assets/audio/music/pirate.ogg',
    critters: { chicken: 8, pig: 4 },
    npcs: 14,
  },
  {
    id: 'wilds',
    name: 'The Whispering Wilds',
    at: [126, 126],
    radius: 132,
    ground: 0x6fa844,
    music: 'assets/audio/music/wilds.ogg',
    critters: { sheep: 10, cow: 8, chicken: 8 },
    npcs: 5,
  },
]

export const MEADOW = {
  id: 'meadow',
  name: 'The Great Meadow',
  ground: 0x86bb51,
  music: 'assets/audio/music/wilds.ogg',
}

/** Which zone is strongest at this point, and by how much (0..1). */
export function zoneAt(x, z) {
  let best = null
  let bestW = 0
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.at[0], z - zn.at[1])
    const w = 1 - d / zn.radius
    if (w > bestW) { bestW = w; best = zn }
  }
  return { zone: best ?? MEADOW, weight: Math.max(0, bestW) }
}
