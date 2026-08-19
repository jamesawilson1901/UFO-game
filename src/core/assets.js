import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

const BASE = import.meta.env.BASE_URL || './'
export const url = (p) => new URL(p.replace(/^\/+/, ''), new URL(BASE, location.href)).href

/**
 * The Kenney Nature Kit GLBs carry a washed-out pastel palette — teal grass,
 * peach dirt, near-white stone — which reads as faded next to the pirate and
 * town kits (those use a texture atlas and look correct). The material names
 * are semantic, so the fix is a straight palette override: warm bark, fresh
 * greens, honest stone. Values are display sRGB.
 */
export const NATURE_PALETTE = {
  grass: 0x6cbf3f,
  leafsGreen: 0x57a83c,
  leafsDark: 0x3e7f33,
  leafsFall: 0xe8942e,
  woodBark: 0x8a5a3b,
  woodBarkDark: 0x6e462d,
  woodBirch: 0xe8e0ce,
  wood: 0xa8734a,
  woodDark: 0x7a5233,
  woodInner: 0xc9a176,
  dirt: 0xb98b5e,
  dirtDark: 0x96683f,
  stone: 0xa8aab0,
  stoneDark: 0x85878d,
  water: 0x4fb8de,
  corn: 0xe8c86a,
  colorRed: 0xd9453f,
  colorRedDark: 0xa8302c,
  colorYellow: 0xf2c43d,
  colorPurple: 0x9b72d4,
  colorWhite: 0xf7f4ec,
  colorTan: 0xd8b98a,
}

/** Apply a name-keyed palette, cloning so cached source scenes stay clean. */
export function applyPalette(root, palette) {
  const cache = new Map()
  root.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      if (!m) return m
      const hex = palette[m.name]
      if (hex === undefined) return m
      if (cache.has(m)) return cache.get(m)
      const nm = m.clone()
      nm.color = new THREE.Color(hex)
      cache.set(m, nm)
      return nm
    })
    o.material = Array.isArray(o.material) ? next : next[0]
  })
  return root
}

/**
 * Kenney/Quaternius kits ship with `metallicFactor: 1`, which renders almost
 * black under plain lights. Everything here wants to look like painted card,
 * so flatten metalness and keep roughness high across the board.
 */
export function normalizeMaterials(root, { flatShade = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    /* Cached models are cloned into every round, and clones SHARE geometry
       and materials with the original. Tagging them lets end-of-round
       teardown free only what that round created — disposing a cached
       geometry silently blanks the model in every later round. */
    if (o.geometry) o.geometry.userData.shared = true
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m) continue
      m.userData.shared = true
      if ('metalness' in m) m.metalness = 0
      if ('roughness' in m) m.roughness = 0.85
      if (flatShade) m.flatShading = true
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
      m.needsUpdate = true
    }
  })
  return root
}

/** Uniform scale + ground-align a model so kits of different units mix cleanly. */
export function fitToHeight(obj, targetHeight) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  if (size.y > 1e-6) {
    const s = targetHeight / size.y
    obj.scale.multiplyScalar(s)
  }
  groundAlign(obj)
  return obj
}

/** Drop an object so its lowest point sits on y = 0 and it is centred in XZ. */
export function groundAlign(obj) {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  const c = box.getCenter(new THREE.Vector3())
  obj.position.x -= c.x
  obj.position.z -= c.z
  obj.position.y -= box.min.y
  return obj
}

export function boundsOf(obj) {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  return { box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) }
}

/**
 * MTLLoader yields MeshPhongMaterial and reads `Kd` verbatim. Blender writes
 * `Kd` in linear space, so without a conversion every painted surface comes
 * out roughly three times too dark — a barn red of 0.2 renders near-black.
 * Swap to MeshStandardMaterial (matching the GLB kits) and correct the space.
 */
export function convertMtlMaterials(root, { linearColors = true } = {}) {
  const seen = new Map()
  root.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      if (!m) return m
      if (seen.has(m)) return seen.get(m)
      const base = (m.color ?? new THREE.Color(0xffffff)).clone()
      const color = linearColors ? base.convertLinearToSRGB() : base
      const std = new THREE.MeshStandardMaterial({
        name: m.name,
        color,
        map: m.map ?? null,
        roughness: 0.85,
        metalness: 0,
        transparent: m.transparent ?? false,
        opacity: m.opacity ?? 1,
        side: m.side ?? THREE.FrontSide,
        flatShading: true,
      })
      seen.set(m, std)
      return std
    })
    o.material = Array.isArray(o.material) ? next : next[0]
  })
  return root
}

export class Assets {
  constructor() {
    this.manager = new THREE.LoadingManager()
    this.gltf = new GLTFLoader(this.manager)
    this.obj = new OBJLoader(this.manager)
    this.mtl = new MTLLoader(this.manager)
    this.fbx = new FBXLoader(this.manager)
    this.tex = new THREE.TextureLoader(this.manager)
    this.cache = new Map()
    this.onProgress = null
    this._done = 0
    this._total = 0
  }

  _tick() {
    this._done++
    if (this.onProgress) this.onProgress(Math.min(1, this._done / Math.max(1, this._total)))
  }

  /** Queue size drives the loading bar; call before loading. */
  expect(n) { this._total += n }

  async glb(path) {
    if (this.cache.has(path)) return this.cache.get(path)
    const p = new Promise((res, rej) => {
      this.gltf.load(url(path), (g) => {
        if (path.includes('/nature/')) applyPalette(g.scene, NATURE_PALETTE)
        normalizeMaterials(g.scene)
        res(g)
      }, undefined, rej)
    }).then((g) => { this._tick(); return g })
      .catch((e) => { this._tick(); console.warn('[assets] failed', path, e); return null })
    this.cache.set(path, p)
    return p
  }

  /** Returns a fresh clone of a GLB scene, safe to mutate/position. */
  async model(path) {
    const g = await this.glb(path)
    if (!g) return null
    return g.scene.clone(true)
  }

  /**
   * @param {object} opts  `linearColors` false for kits exported by Asset
   *   Forge, which writes sRGB directly; Blender writes linear and needs the
   *   conversion. Guessing wrong makes a kit either muddy or bleached.
   */
  async objMtl(objPath, mtlPath, opts = {}) {
    const key = objPath
    if (this.cache.has(key)) return this.cache.get(key)
    const p = (async () => {
      const dir = mtlPath.slice(0, mtlPath.lastIndexOf('/') + 1)
      // MTLLoader/OBJLoader carry per-load state (path, materials), so a
      // shared instance would race when several models load concurrently.
      const mtl = new MTLLoader(this.manager)
      const obj = new OBJLoader(this.manager)
      const mats = await new Promise((res, rej) =>
        mtl.setPath(url(dir)).load(mtlPath.slice(dir.length), res, undefined, rej))
      mats.preload()
      const o = await new Promise((res, rej) =>
        obj.setMaterials(mats).setPath(url(dir)).load(objPath.slice(dir.length), res, undefined, rej))
      convertMtlMaterials(o, opts)
      normalizeMaterials(o)
      return o
    })().then((o) => { this._tick(); return o })
      .catch((e) => { this._tick(); console.warn('[assets] failed', objPath, e); return null })
    this.cache.set(key, p)
    return p
  }

  async fbxModel(path, texPath) {
    const key = path
    if (this.cache.has(key)) return this.cache.get(key)
    const p = new Promise((res, rej) => this.fbx.load(url(path), res, undefined, rej))
      .then(async (o) => {
        if (texPath) {
          const t = await new Promise((res) => this.tex.load(url(texPath), res, undefined, () => res(null)))
          if (t) {
            t.colorSpace = THREE.SRGBColorSpace
            o.traverse((m) => {
              if (!m.isMesh) return
              m.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0 })
            })
          }
        }
        normalizeMaterials(o)
        this._tick()
        return o
      })
      .catch((e) => { this._tick(); console.warn('[assets] failed', path, e); return null })
    this.cache.set(key, p)
    return p
  }

  async texture(path) {
    if (this.cache.has(path)) return this.cache.get(path)
    const p = new Promise((res) => this.tex.load(url(path), res, undefined, () => res(null)))
      .then((t) => {
        if (t) t.colorSpace = THREE.SRGBColorSpace
        this._tick()
        return t
      })
    this.cache.set(path, p)
    return p
  }
}

export const assets = new Assets()

/** Scale so the object's widest horizontal dimension matches `targetWidth`. */
export function fitToWidth(obj, targetWidth) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const w = Math.max(size.x, size.z)
  if (w > 1e-6) obj.scale.multiplyScalar(targetWidth / w)
  groundAlign(obj)
  return obj
}

/** Native bounding size of a model, cached by key. */
const _sizeCache = new Map()
export function nativeSize(key, object) {
  let s = _sizeCache.get(key)
  if (!s) {
    const b = new THREE.Box3().setFromObject(object)
    const v = b.getSize(new THREE.Vector3())
    s = { x: v.x, y: v.y, z: v.z, w: Math.max(v.x, v.z), minY: b.min.y }
    _sizeCache.set(key, s)
  }
  return s
}
