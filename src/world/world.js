import * as THREE from 'three'
import { assets, normalizeMaterials, nativeSize } from '../core/assets.js'
import { StaticBatcher } from './batcher.js'
import { buildTerrain, buildWater } from './terrain.js'
import { WORLD_SIZE, WORLD_HALF } from './themes.js'

/**
 * Builds one themed sandbox. The theme supplies the palette, the model list
 * and a `build(world, batch)` routine; everything here is the generic
 * machinery those recipes call into.
 */
export class World {
  constructor(scene, rng, theme) {
    this.scene = scene
    this.rng = rng
    this.theme = theme
    this.landmarks = []
    this.models = new Map()
    this.seaLevel = theme.water?.level ?? -999
    this.size = WORLD_SIZE
    this.half = WORLD_HALF
  }

  async build(onStep) {
    const step = onStep ?? (() => {})
    const theme = this.theme

    step('Sculpting the land…')
    const { mesh: terrain, heightAt } = buildTerrain(theme, this.rng)
    this.scene.add(terrain)
    this.terrain = terrain
    this.heightAt = heightAt
    const water = buildWater(theme)
    if (water) this.scene.add(water)

    step('Unpacking the scenery…')
    const wanted = [...new Set((theme.models ?? []).filter(Boolean))]
    assets.expect(wanted.length + 24)
    await Promise.all(wanted.map(async (p) => {
      const g = await assets.glb(p)
      if (g) this.models.set(p, g.scene)
    }))

    // Quaternius farm buildings ship as OBJ+MTL rather than GLB.
    if (theme.farmModels?.length) {
      step('Raising the barns…')
      await Promise.all(theme.farmModels.map(async (n) => {
        const o = await assets.objMtl(`assets/farm/${n}.obj`, `assets/farm/${n}.mtl`)
        if (o) this.models.set(`farm:${n}`, o)
      }))
    }
    for (const k of theme.extraModels ?? []) {
      if (k === 'tractor') {
        const g = await assets.glb('assets/props/tractor.glb')
        if (g) this.models.set('tractor', g.scene)
      } else if (k === 'potty') {
        const g = await assets.glb('assets/props/portapotty/scene.gltf')
        if (g) this.models.set('potty', g.scene)
      }
    }

    step(`Building ${theme.name}…`)
    const batch = new StaticBatcher()
    theme.build(this, batch)

    step('Baking the world…')
    this.scenery = batch.build('scenery')
    this.scene.add(this.scenery)
    return this
  }

  /* ══ placement helpers ═══════════════════════════════════════════ */

  /**
   * Place a model into the static batch.
   *
   * Prefer `height` / `width` over a raw `scale`: the kits come from several
   * studios with different unit conventions, so asking for "an 11-metre barn"
   * is the only way to get a world that reads at a consistent scale.
   * 1 world unit = 1 metre.
   */
  put(batch, key, x, z, {
    scale = null, height = null, width = null,
    rotY = null, yOff = 0, tilt = 0, jitter = 0,
  } = {}) {
    const src = this.models.get(key)
    if (!src) return
    const rng = this.rng

    let s
    if (height != null || width != null) {
      const n = nativeSize(key, src)
      s = height != null ? height / Math.max(1e-4, n.y) : width / Math.max(1e-4, n.w)
    } else {
      s = scale ?? 1
    }
    if (jitter) s *= rng.range(1 - jitter, 1 + jitter)

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      tilt ? rng.range(-tilt, tilt) : 0,
      rotY ?? rng.range(0, Math.PI * 2),
      tilt ? rng.range(-tilt, tilt) : 0,
    ))
    m.compose(new THREE.Vector3(x, this.heightAt(x, z) + yOff, z),
      q, new THREE.Vector3(s, s, s))
    batch.add(src, m)
  }

  /** Scatter n copies inside a circle, skipping anything underwater. */
  scatter(batch, keys, cx, cz, radius, n, opts = {}) {
    const rng = this.rng
    const { minR = 0, minH = 1.0, ...rest } = opts
    const pool = keys.filter((k) => this.models.has(k))
    if (!pool.length) return
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = minR + Math.sqrt(rng()) * Math.max(0, radius - minR)
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      if (Math.abs(x) > WORLD_HALF - 8 || Math.abs(z) > WORLD_HALF - 8) continue
      if (this.heightAt(x, z) < minH) continue
      this.put(batch, rng.pick(pool), x, z, rest)
    }
  }

  fenceLine(batch, key, x1, z1, x2, z2, spacing = 3.4, opts = {}) {
    const dx = x2 - x1, dz = z2 - z1
    const n = Math.max(1, Math.round(Math.hypot(dx, dz) / spacing))
    const rot = Math.atan2(dx, dz) + Math.PI / 2
    for (let i = 0; i <= n; i++) {
      const t = i / n
      this.put(batch, key, x1 + dx * t, z1 + dz * t, { rotY: rot, ...opts })
    }
  }

  fenceRect(batch, key, cx, cz, w, h, spacing = 3.4, opts = {}) {
    const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - h / 2, z2 = cz + h / 2
    this.fenceLine(batch, key, x1, z1, x2, z1, spacing, opts)
    this.fenceLine(batch, key, x2, z1, x2, z2, spacing, opts)
    this.fenceLine(batch, key, x2, z2, x1, z2, spacing, opts)
    this.fenceLine(batch, key, x1, z2, x1, z1, spacing, opts)
  }

  mark(name, x, z, kind) {
    const p = new THREE.Vector3(x, this.heightAt(x, z), z)
    this.landmarks.push({ name, kind, pos: p })
    return p
  }

  /**
   * Kenney kits share one `colormap` material sampling a palette atlas, so
   * there is nothing to tint selectively — repainting means replacing the
   * material outright. Materials are cloned first: the source scenes are
   * cached and shared, so mutating in place would repaint the whole world.
   */
  repaint(root, colorHex, { flat = true } = {}) {
    const cache = new Map()
    root.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const next = mats.map((m) => {
        if (!m) return m
        if (cache.has(m)) return cache.get(m)
        const nm = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex), roughness: 0.82, metalness: 0, flatShading: flat,
        })
        cache.set(m, nm)
        return nm
      })
      o.material = Array.isArray(o.material) ? next : next[0]
    })
    return root
  }

  /** A random spot on dry land, at least `clear` from the given point. */
  randomSpot(rng, { clear = 0, from = null, radius = WORLD_HALF - 30, minH = 1.2 } = {}) {
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = Math.sqrt(rng()) * radius
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (this.heightAt(x, z) < minH) continue
      if (from && Math.hypot(x - from.x, z - from.z) < clear) continue
      return { x, z }
    }
    return null
  }
}
