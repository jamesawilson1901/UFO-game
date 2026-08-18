import * as THREE from 'three'
import { WORLD_SIZE, WORLD_HALF } from './themes.js'

/**
 * One big subdivided plane, vertex-coloured from the theme palette and gently
 * displaced. Themes with a `bay` get a bowl carved below sea level.
 */
export function buildTerrain(theme, rng) {
  const SEG = 150
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const base = new THREE.Color(theme.ground)
  const sand = new THREE.Color(theme.sand ?? 0xe8d7a6)
  const rock = new THREE.Color(theme.rock ?? 0x8d8b86)

  // Cheap deterministic value noise — no dependency, and heightAt can mirror it.
  const n2 = (x, z) => {
    const s = Math.sin(x * 0.021) * Math.cos(z * 0.019)
      + 0.5 * Math.sin(x * 0.047 + 1.7) * Math.cos(z * 0.051 - 0.9)
      + 0.25 * Math.sin(x * 0.11 - 2.3) * Math.cos(z * 0.097 + 0.4)
    return s / 1.75
  }

  // The landmass sits well clear of the waterline; only a bay dips below.
  const BASE = 4.4
  const bay = theme.bay ?? null

  const heightAt = (x, z) => {
    let h = BASE + n2(x, z) * 3.2
    if (bay) {
      const d = Math.hypot(x - bay.x, z - bay.z)
      const k = Math.max(0, 1 - d / bay.radius)
      h -= k * k * bay.depth
    }
    // Hills round the rim keep the playfield visually contained.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF
    h += Math.pow(Math.max(0, edge - 0.74) / 0.26, 2) * 26
    return h
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, h)

    c.copy(base)
    if (h < 2.2) c.lerp(sand, Math.min(1, (2.2 - h) / 4))
    if (h > 17) c.lerp(rock, Math.min(1, (h - 17) / 14))
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
  return { mesh, heightAt }
}

export function buildWater(theme) {
  if (!theme.water) return null
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.5, WORLD_SIZE * 1.5, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: theme.water.color, transparent: true, opacity: 0.82,
    roughness: 0.25, metalness: 0.1,
  }))
  mesh.position.y = theme.water.level
  mesh.name = 'water'
  return mesh
}
