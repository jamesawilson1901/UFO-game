import * as THREE from 'three'
import { WORLD, ZONES, MEADOW } from './zones.js'

/**
 * One big subdivided plane, vertex-coloured per zone and gently displaced so
 * the ground reads as landscape rather than lino. The pirate cove is carved
 * below sea level to make a real bay.
 */
export function buildTerrain(rng) {
  const SEG = 160
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const meadow = new THREE.Color(MEADOW.ground)

  // Cheap value noise — deterministic, no dependency.
  const n2 = (x, z) => {
    const s = Math.sin(x * 0.021) * Math.cos(z * 0.019)
      + 0.5 * Math.sin(x * 0.047 + 1.7) * Math.cos(z * 0.051 - 0.9)
      + 0.25 * Math.sin(x * 0.11 - 2.3) * Math.cos(z * 0.097 + 0.4)
    return s / 1.75
  }

  const cove = ZONES.find((z) => z.id === 'pirate')
  // The noise swings either side of zero, so the landmass is lifted clear of
  // the waterline. Only the carved bay is allowed to dip below sea level.
  const BASE = 4.4

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)

    let h = BASE + n2(x, z) * 3.2

    // Carve the bay: a bowl centred just seaward of the cove.
    const bx = cove.at[0] - 46
    const bz = cove.at[1] + 46
    const bd = Math.hypot(x - bx, z - bz)
    const bay = Math.max(0, 1 - bd / 122)
    h -= bay * bay * 13

    // Ring of hills around the rim keeps the playfield visually contained.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half
    h += Math.pow(Math.max(0, edge - 0.72) / 0.28, 2) * 26

    pos.setY(i, h)

    // ── colour ──
    c.copy(meadow)
    let acc = 0
    for (const zn of ZONES) {
      const d = Math.hypot(x - zn.at[0], z - zn.at[1])
      const w = Math.max(0, 1 - d / zn.radius)
      if (w <= 0) continue
      const k = w * w * (3 - 2 * w)     // smoothstep
      c.lerp(new THREE.Color(zn.ground), k / (1 + acc))
      acc += k
    }
    // Sand at the waterline, rock on the high rim.
    if (h < 2.2) c.lerp(new THREE.Color(0xe8d7a6), Math.min(1, (2.2 - h) / 4.0))
    if (h > 17) c.lerp(new THREE.Color(0x8d8b86), Math.min(1, (h - 17) / 14))
    // Subtle per-vertex variation stops the flat areas looking like plastic.
    const v = 1 + (rng() - 0.5) * 0.07
    colors[i * 3] = c.r * v
    colors[i * 3 + 1] = c.g * v
    colors[i * 3 + 2] = c.b * v
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
  }))
  mesh.receiveShadow = true
  mesh.name = 'terrain'

  /** Sample terrain height by re-evaluating the same functions. */
  const heightAt = (x, z) => {
    let h = BASE + n2(x, z) * 3.2
    const bd = Math.hypot(x - (cove.at[0] - 46), z - (cove.at[1] + 46))
    const bay = Math.max(0, 1 - bd / 122)
    h -= bay * bay * 13
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half
    h += Math.pow(Math.max(0, edge - 0.72) / 0.28, 2) * 26
    return h
  }

  return { mesh, heightAt }
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(WORLD.size * 1.4, WORLD.size * 1.4, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f8fbf, transparent: true, opacity: 0.82,
    roughness: 0.25, metalness: 0.1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = WORLD.seaLevel
  mesh.receiveShadow = false
  mesh.name = 'water'
  return mesh
}
