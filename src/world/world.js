import * as THREE from 'three'
import { assets, normalizeMaterials, nativeSize } from '../core/assets.js'
import { StaticBatcher } from './batcher.js'
import { buildTerrain, buildWater } from './terrain.js'
import { WORLD, ZONES } from './zones.js'

const N = (f) => `assets/nature/${f}.glb`
const P = (f) => `assets/pirate/${f}.glb`
const T = (f) => `assets/town/${f}.glb`
const F = (f) => `assets/food/${f}.glb`

/**
 * Every Kenney town/pirate model shares one material called `colormap` that
 * samples a palette atlas, so there is nothing to tint selectively — a
 * hospital has to be made by replacing the material outright with a flat
 * colour. Materials are cloned first; the source scenes are cached and
 * shared, so mutating in place would repaint the whole world.
 */
function repaint(root, colorHex, { flat = true } = {}) {
  const cache = new Map()
  root.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      if (!m) return m
      if (cache.has(m)) return cache.get(m)
      const nm = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.82,
        metalness: 0,
        flatShading: flat,
      })
      cache.set(m, nm)
      return nm
    })
    o.material = Array.isArray(o.material) ? next : next[0]
  })
  return root
}

export class World {
  constructor(scene, rng) {
    this.scene = scene
    this.rng = rng
    this.landmarks = []      // notable spots, used to seed NPC/critter homes
    this.beacons = []        // {pos, name} for the compass
  }

  async build(onStep) {
    const rng = this.rng
    const step = (m) => onStep?.(m)

    /* ── ground ─────────────────────────────────────────────────── */
    step('Sculpting the countryside…')
    const { mesh: terrain, heightAt } = buildTerrain(rng)
    this.scene.add(terrain)
    this.terrain = terrain
    this.heightAt = heightAt
    this.scene.add(buildWater())

    /* ── preload every model the world needs, once ──────────────── */
    step('Unpacking the scenery…')
    const need = [
      ...['tree_default', 'tree_oak', 'tree_tall', 'tree_fat', 'tree_thin', 'tree_detailed',
        'tree_small', 'tree_blocks', 'tree_cone', 'tree_default_fall', 'tree_oak_fall',
        'tree_pineTallA', 'tree_pineRoundA', 'tree_pineSmallA', 'tree_pineGroundA',
        'tree_palm', 'tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall',
        'rock_largeA', 'rock_largeC', 'rock_smallA', 'rock_smallC', 'rock_tallA', 'rock_tallD',
        'stone_largeA', 'stone_smallB', 'stone_tallC',
        'grass', 'grass_large', 'grass_leafs', 'grass_leafsLarge',
        'plant_bush', 'plant_bushLarge', 'plant_bushSmall', 'plant_flatShort', 'plant_flatTall',
        'flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redC', 'flower_yellowC',
        'mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanGroup',
        'crop_carrot', 'crop_melon', 'crop_pumpkin', 'crop_turnip',
        'crops_cornStageD', 'crops_cornStageC', 'crops_wheatStageB', 'crops_leafsStageB',
        'crops_dirtRow', 'crops_dirtSingle', 'crops_dirtDoubleRow',
        'fence_simple', 'fence_planks', 'fence_gate', 'fence_corner', 'fence_simpleHigh',
        'log', 'log_large', 'log_stack', 'stump_round', 'stump_old',
        'campfire_logs', 'campfire_stones', 'tent_smallOpen', 'tent_detailedOpen',
        'cactus_tall', 'cactus_short', 'lily_large', 'sign', 'path_stone', 'pot_large', 'pot_small',
        'statue_head', 'statue_obelisk', 'statue_column', 'bed',
        'cliff_blockRock', 'canoe', 'hanging_moss', 'bridge_wood',
      ].map(N),
      ...['ship-pirate-large', 'ship-pirate-medium', 'ship-pirate-small', 'ship-wreck', 'ship-ghost',
        'boat-row-large', 'boat-row-small', 'cannon', 'cannon-mobile', 'cannon-ball',
        'chest', 'crate', 'crate-bottles', 'barrel', 'bottle', 'bottle-large',
        'flag-pirate', 'flag-pirate-high', 'flag-pirate-pennant', 'mast', 'mast-ropes',
        'palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend',
        'structure-platform-dock', 'structure-platform-dock-small', 'structure-platform',
        'structure-fence', 'tower-watch', 'tower-complete-small', 'tower-base',
        'rocks-sand-a', 'rocks-sand-b', 'rocks-a', 'patch-sand', 'patch-sand-foliage',
        'tool-shovel', 'tool-paddle', 'hole',
      ].map(P),
      ...['wall', 'wall-door', 'wall-window-glass', 'wall-window-small', 'wall-corner',
        'wall-half', 'wall-doorway-square-wide', 'wall-block',
        'roof', 'roof-corner', 'roof-gable', 'roof-gable-end', 'roof-flat', 'roof-point',
        'roof-high', 'roof-high-gable', 'roof-window', 'chimney', 'chimney-top',
        'road', 'road-bend', 'road-corner', 'road-curb', 'fountain-round', 'fountain-round-detail',
        'cart', 'cart-high', 'stall', 'stall-bench', 'lantern', 'hedge', 'hedge-large',
        'banner-red', 'banner-green', 'pillar-stone', 'stairs-stone', 'planks',
      ].map(T),
      ...['pizza', 'burger', 'cake-birthday', 'donut-sprinkles', 'hot-dog', 'ice-cream',
        'watermelon', 'turkey', 'pumpkin', 'barrel', 'mug', 'cheese'].map(F),
    ]
    assets.expect(need.length + 20)
    const models = new Map()
    await Promise.all(need.map(async (p) => {
      const g = await assets.glb(p)
      if (g) models.set(p, g.scene)
    }))
    this.models = models

    /* ── farm buildings (OBJ) + props ───────────────────────────── */
    step('Raising the barns…')
    const farmNames = ['Barn', 'BigBarn', 'OpenBarn', 'SmallBarn', 'Silo', 'Silo_House',
      'Windmill', 'TowerWindmill', 'WaterTower', 'Well', 'ChickenCoop', 'Fence', 'Fence2']
    await Promise.all(farmNames.map(async (n) => {
      const o = await assets.objMtl(`assets/farm/${n}.obj`, `assets/farm/${n}.mtl`)
      if (o) models.set(`farm:${n}`, o)
    }))
    const tractor = await assets.glb('assets/props/tractor.glb')
    if (tractor) models.set('tractor', tractor.scene)
    const potty = await assets.glb('assets/props/portapotty/scene.gltf')
    if (potty) models.set('potty', potty.scene)

    /* ── scatter ────────────────────────────────────────────────── */
    const batch = new StaticBatcher()
    this.batch = batch

    step('Planting the wilds…')
    this._buildMeadow(batch)
    this._buildWilds(batch)
    step('Ploughing the fields…')
    this._buildFarm(batch)
    step('Scrubbing in…')
    this._buildMedical(batch)
    step('Hoisting the black flag…')
    this._buildPirateCove(batch)

    step('Baking the world…')
    const scenery = batch.build('scenery')
    this.scene.add(scenery)
    this.scenery = scenery

    return this
  }

  /* ══ placement helpers ═══════════════════════════════════════════ */

  /**
   * Add a model to the static batch at a world position.
   *
   * Prefer `height` / `width` over a raw `scale`: the source kits come from
   * three different studios with three different unit conventions, so asking
   * for "an 11-metre barn" is the only way to get a world that reads at a
   * consistent scale. 1 world unit = 1 metre.
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
      s = height != null
        ? height / Math.max(1e-4, n.y)
        : width / Math.max(1e-4, n.w)
    } else {
      s = scale ?? 1
    }
    if (jitter) s *= rng.range(1 - jitter, 1 + jitter)

    const y = this.heightAt(x, z) + yOff
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      tilt ? rng.range(-tilt, tilt) : 0,
      rotY ?? rng.range(0, Math.PI * 2),
      tilt ? rng.range(-tilt, tilt) : 0,
    ))
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s))
    batch.add(src, m)
  }

  /** Scatter n copies of a model set inside a circle, skipping water. */
  scatter(batch, keys, cx, cz, radius, n, opts = {}) {
    const rng = this.rng
    const { minR = 0, minH = 1.0, ...rest } = opts
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = minR + Math.sqrt(rng()) * (radius - minR)
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      if (Math.abs(x) > WORLD.half - 8 || Math.abs(z) > WORLD.half - 8) continue
      if (this.heightAt(x, z) < minH) continue
      this.put(batch, rng.pick(keys), x, z, rest)
    }
  }

  /** A run of fence posts between two points. */
  fenceLine(batch, key, x1, z1, x2, z2, spacing = 3.4, opts = {}) {
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const n = Math.max(1, Math.round(len / spacing))
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

  /* ══ districts ═══════════════════════════════════════════════════ */

  _buildMeadow(batch) {
    this.scatter(batch, [N('grass'), N('grass_large'), N('grass_leafs')], 0, 0, 150, 700,
      { height: 0.7, jitter: 0.4, minH: 1.2 })
    this.scatter(batch, [N('flower_redA'), N('flower_yellowA'), N('flower_purpleA'),
      N('flower_redC'), N('flower_yellowC')], 0, 0, 145, 300, { height: 0.6, jitter: 0.3, minH: 1.4 })
    this.scatter(batch, [N('tree_default'), N('tree_oak'), N('tree_small'), N('tree_fat')],
      0, 0, 105, 46, { height: 8, jitter: 0.3, minR: 34, minH: 1.6 })
    this.scatter(batch, [N('rock_smallA'), N('rock_smallC'), N('stone_smallB')],
      0, 0, 150, 90, { height: 0.45, jitter: 0.5, tilt: 0.12, minH: 1.4 })

    // A stone circle in the dead centre — a landmark you can navigate by.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      this.put(batch, N('statue_column'), Math.cos(a) * 15, Math.sin(a) * 15,
        { height: 6.5, rotY: -a })
    }
    this.put(batch, N('statue_obelisk'), 0, 0, { height: 11, rotY: 0 })
    this.mark('The Standing Stones', 0, 0, 'landmark')
  }

  _buildWilds(batch) {
    const zn = ZONES.find((z) => z.id === 'wilds')
    const [cx, cz] = zn.at
    const rng = this.rng

    this.scatter(batch, [N('tree_pineTallA'), N('tree_pineRoundA'), N('tree_tall'),
      N('tree_thin'), N('tree_detailed'), N('tree_blocks'), N('tree_cone'),
      N('tree_default_fall'), N('tree_oak_fall')], cx, cz, zn.radius, 260,
      { height: 11, jitter: 0.3, tilt: 0.04, minH: 1.5 })
    this.scatter(batch, [N('tree_pineSmallA'), N('tree_small')], cx, cz, zn.radius, 90,
      { height: 5, jitter: 0.3, minH: 1.5 })
    this.scatter(batch, [N('plant_bush'), N('plant_bushLarge'), N('plant_bushSmall'),
      N('plant_flatTall'), N('grass_leafsLarge')], cx, cz, zn.radius, 260,
      { height: 1.5, jitter: 0.4, minH: 1.4 })
    this.scatter(batch, [N('mushroom_red'), N('mushroom_redGroup'), N('mushroom_tan'),
      N('mushroom_tanGroup')], cx, cz, zn.radius * 0.9, 90, { height: 1.1, jitter: 0.5, minH: 1.4 })
    this.scatter(batch, [N('rock_largeA'), N('rock_largeC'), N('rock_tallA'), N('rock_tallD'),
      N('stone_largeA'), N('stone_tallC')], cx, cz, zn.radius, 110,
      { height: 3.2, jitter: 0.5, tilt: 0.09, minH: 1.4 })
    this.scatter(batch, [N('log'), N('log_large'), N('log_stack'), N('stump_round'), N('stump_old')],
      cx, cz, zn.radius, 70, { height: 1.3, jitter: 0.35, minH: 1.4 })

    // A little camp — three tents and a fire ring.
    const camp = [cx - 34, cz + 22]
    this.put(batch, N('campfire_stones'), camp[0], camp[1], { height: 0.6 })
    this.put(batch, N('campfire_logs'), camp[0], camp[1], { height: 1.1 })
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4
      this.put(batch, rng.pick([N('tent_smallOpen'), N('tent_detailedOpen')]),
        camp[0] + Math.cos(a) * 11, camp[1] + Math.sin(a) * 11, { height: 3, rotY: -a + Math.PI })
    }
    this.mark("Woodcutter's Camp", camp[0], camp[1], 'camp')
    this.mark(zn.name, cx, cz, 'zone')
  }

  _buildFarm(batch) {
    const zn = ZONES.find((z) => z.id === 'farm')
    const [cx, cz] = zn.at
    const rng = this.rng
    const FB = (n) => `farm:${n}`

    // Farmyard cluster. Heights are what the building would really be.
    this.put(batch, FB('BigBarn'), cx - 6, cz - 8, { height: 14, rotY: 0.2 })
    this.put(batch, FB('Barn'), cx + 26, cz - 2, { height: 11, rotY: -0.5 })
    this.put(batch, FB('OpenBarn'), cx + 8, cz + 22, { height: 9, rotY: Math.PI })
    this.put(batch, FB('SmallBarn'), cx - 30, cz + 14, { height: 8, rotY: 1.1 })
    this.put(batch, FB('Silo'), cx - 24, cz - 26, { height: 15, rotY: 0 })
    this.put(batch, FB('Silo_House'), cx - 6, cz - 34, { height: 15, rotY: 0.1 })
    this.put(batch, FB('Windmill'), cx + 46, cz - 34, { height: 17, rotY: -0.3 })
    this.put(batch, FB('TowerWindmill'), cx - 52, cz - 40, { height: 18, rotY: 0.6 })
    this.put(batch, FB('WaterTower'), cx + 40, cz + 26, { height: 12, rotY: 0 })
    this.put(batch, FB('Well'), cx + 2, cz + 4, { height: 2.6, rotY: 0 })
    this.put(batch, FB('ChickenCoop'), cx - 40, cz - 4, { height: 3.4, rotY: -0.8 })
    this.put(batch, 'tractor', cx + 16, cz + 8, { height: 3.2, rotY: 2.1 })
    this.put(batch, 'tractor', cx - 46, cz + 34, { height: 3.2, rotY: -0.6 })

    this.mark('Sunnyside Farm', cx, cz, 'zone')
    this.mark('The Big Barn', cx - 6, cz - 8, 'building')

    // Paddocks — where most of the cows live.
    this.fenceRect(batch, FB('Fence'), cx - 18, cz + 48, 62, 44, 4.2, { height: 1.4 })
    this.fenceRect(batch, FB('Fence2'), cx + 46, cz + 62, 46, 40, 4.2, { height: 1.4 })
    this.fenceRect(batch, FB('Fence'), cx - 62, cz + 8, 40, 46, 4.2, { height: 1.4 })
    this.paddocks = [
      { x: cx - 18, z: cz + 48, w: 62, h: 44 },
      { x: cx + 46, z: cz + 62, w: 46, h: 40 },
      { x: cx - 62, z: cz + 8, w: 40, h: 46 },
    ]

    // Crop strips — long rows of corn and wheat.
    for (let f = 0; f < 5; f++) {
      const ox = cx + 6 + f * 13
      const oz = cz - 66
      const crop = rng.pick([N('crops_cornStageD'), N('crops_cornStageC'), N('crops_wheatStageB')])
      for (let i = 0; i < 22; i++) {
        this.put(batch, N('crops_dirtRow'), ox, oz + i * 2.4, { width: 2.6, rotY: 0 })
        this.put(batch, crop, ox, oz + i * 2.4, { height: 1.9, rotY: 0, jitter: 0.12 })
      }
    }
    this.scatter(batch, [N('crop_pumpkin'), N('crop_melon'), N('crop_carrot'), N('crop_turnip')],
      cx - 44, cz - 60, 22, 60, { height: 0.8, jitter: 0.25, minH: 1.4 })
    this.mark('The Pumpkin Patch', cx - 44, cz - 60, 'field')

    this.scatter(batch, [N('tree_default'), N('tree_oak'), N('tree_fat')], cx, cz, zn.radius, 60,
      { height: 8, jitter: 0.3, minR: 60, minH: 1.5 })
    this.scatter(batch, [N('grass'), N('grass_large')], cx, cz, zn.radius, 320,
      { height: 0.7, jitter: 0.4, minH: 1.4 })
    this.scatter(batch, [N('log_stack'), N('pot_large'), N('pot_small')], cx, cz, 70, 26,
      { height: 1.2, jitter: 0.3, minH: 1.4 })
  }

  _buildMedical(batch) {
    const zn = ZONES.find((z) => z.id === 'medical')
    const [cx, cz] = zn.at

    /* The packs contain no medical assets at all, so the hospital is
       assembled from fantasy-town parts and repainted. Everything shares one
       palette-atlas material, so each piece is given a flat colour instead:
       clinical white walls, red roofs. From the air it reads unmistakably as
       a hospital, which is all a five-year-old needs. */
    const PALETTE = {
      wall: 0xf7fbfc,
      'wall-door': 0xdfe9ec,
      'wall-window-glass': 0xcfe6f2,
      'wall-window-small': 0xcfe6f2,
      'wall-corner': 0xeef5f7,
      'wall-half': 0xf7fbfc,
      'wall-doorway-square-wide': 0xdfe9ec,
      'wall-block': 0xf7fbfc,
      'roof-flat': 0xd94a4a,
      roof: 0xd94a4a,
      'roof-corner': 0xd94a4a,
      'roof-gable': 0xd94a4a,
      'roof-gable-end': 0xd94a4a,
      chimney: 0xe8eef0,
    }
    for (const [key, color] of Object.entries(PALETTE)) {
      const src = this.models.get(T(key))
      if (src) this.models.set(`med:${key}`, repaint(src.clone(true), color))
    }
    const M = (n) => `med:${n}`

    /* Kenney town pieces are modular on a 1-unit grid. One module is one
       storey, so a 4-metre grid gives believable rooms. */
    const U = 4
    const wing = (ox, oz, w, d, rot = 0, storeys = 2) => {
      const cos = Math.cos(rot), sin = Math.sin(rot)
      const at = (lx, lz) => [ox + lx * cos - lz * sin, oz + lx * sin + lz * cos]
      for (let ix = 0; ix < w; ix++) {
        for (let iz = 0; iz < d; iz++) {
          const edge = ix === 0 || iz === 0 || ix === w - 1 || iz === d - 1
          if (!edge) continue
          const lx = (ix - (w - 1) / 2) * U
          const lz = (iz - (d - 1) / 2) * U
          const [x, z] = at(lx, lz)
          const corner = (ix === 0 || ix === w - 1) && (iz === 0 || iz === d - 1)
          /* wall.glb is a thin panel that spans Z, so the east/west runs
             sit at the base rotation and the north/south runs need a
             quarter turn. Getting this backwards leaves the building open. */
          let face = rot
          if (iz === 0) face = rot + Math.PI / 2
          else if (iz === d - 1) face = rot - Math.PI / 2
          else if (ix === 0) face = rot + Math.PI
          for (let s = 0; s < storeys; s++) {
            let key = 'wall'
            if (corner) key = 'wall-corner'
            else if (s === 0 && ix === Math.floor(w / 2) && iz === d - 1) key = 'wall-door'
            else if ((ix + iz + s) % 2 === 0) key = 'wall-window-glass'
            this.put(batch, M(key), x, z, { height: U, rotY: face, yOff: s * U })
          }
        }
      }
      // Flat roof slab on top.
      for (let ix = 0; ix < w; ix++) {
        for (let iz = 0; iz < d; iz++) {
          const lx = (ix - (w - 1) / 2) * U
          const lz = (iz - (d - 1) / 2) * U
          const [x, z] = at(lx, lz)
          this.put(batch, M('roof-flat'), x, z, { width: U, rotY: rot, yOff: storeys * U })
        }
      }
    }

    wing(cx, cz, 7, 5, 0, 3)
    wing(cx - 34, cz + 18, 5, 4, Math.PI / 2, 2)
    wing(cx + 32, cz + 20, 4, 4, 0, 2)
    this.mark('St. Bovine Hospital', cx, cz, 'zone')
    this.mark('A&E Department', cx - 34, cz + 18, 'building')

    // Big red cross on the forecourt, made from repainted road tiles.
    const roadSrc = this.models.get(T('road'))
    if (roadSrc) this.models.set('med:cross', repaint(roadSrc.clone(true), 0xd94a4a))
    for (let i = -3; i <= 3; i++) {
      this.put(batch, 'med:cross', cx + i * 4, cz + 30, { width: 4, rotY: 0 })
      this.put(batch, 'med:cross', cx, cz + 30 + i * 4, { width: 4, rotY: 0 })
    }

    // Approach road, ambulances (repainted carts), lamps and hedging.
    for (let i = 0; i < 26; i++) {
      this.put(batch, T('road'), cx - 60 + i * 4, cz + 48, { width: 4, rotY: 0 })
    }
    // Ambulances: white carts with a red one for the emergency fleet.
    for (const [k, c, tag] of [['cart', 0xfafcfc, 'w'], ['cart-high', 0xfafcfc, 'w'],
      ['cart', 0xe23b3b, 'r']]) {
      const src = this.models.get(T(k))
      if (src) this.models.set(`amb:${k}:${tag}`, repaint(src.clone(true), c))
    }
    this.put(batch, 'amb:cart:w', cx - 14, cz + 40, { height: 2.4, rotY: 0.2 })
    this.put(batch, 'amb:cart-high:w', cx + 12, cz + 40, { height: 2.8, rotY: -0.3 })
    this.put(batch, 'amb:cart:r', cx + 40, cz + 48, { height: 2.4, rotY: 1.6 })

    this.put(batch, T('fountain-round'), cx + 2, cz - 30, { width: 7 })
    this.put(batch, T('fountain-round-detail'), cx + 2, cz - 30, { width: 7 })
    this.mark('Hospital Fountain', cx + 2, cz - 30, 'landmark')

    for (let i = 0; i < 14; i++) {
      this.put(batch, T('lantern'), cx - 56 + i * 8.5, cz + 54, { height: 3.4, rotY: 0 })
    }
    /* Hedges are modular tiles meant to abut into a run — scattering them
       individually just looks like litter, so they are planted in borders. */
    const hedgeRow = (x1, z1, x2, z2) => {
      const dx = x2 - x1, dz = z2 - z1
      const len = Math.hypot(dx, dz)
      const n = Math.max(1, Math.round(len / 2.4))
      const rot = Math.atan2(dx, dz)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        this.put(batch, T('hedge'), x1 + dx * t, z1 + dz * t, { width: 2.5, rotY: rot })
      }
    }
    hedgeRow(cx - 62, cz + 44, cx - 22, cz + 44)
    hedgeRow(cx + 22, cz + 44, cx + 62, cz + 44)
    hedgeRow(cx - 62, cz + 44, cx - 62, cz + 12)
    hedgeRow(cx + 62, cz + 44, cx + 62, cz + 12)
    hedgeRow(cx - 24, cz - 44, cx + 28, cz - 44)
    this.scatter(batch, [N('tree_small'), N('tree_default')], cx, cz, zn.radius, 55,
      { height: 6, jitter: 0.25, minR: 58, minH: 1.5 })
    this.scatter(batch, [N('grass'), N('flower_redA'), N('flower_yellowA')], cx, cz, zn.radius, 210,
      { height: 0.7, jitter: 0.4, minH: 1.4 })

    // Portable loos, because a five-year-old will find that funnier than a scanner.
    for (let i = 0; i < 5; i++) {
      this.put(batch, 'potty', cx + 48 + i * 4, cz - 12, { height: 2.4, rotY: -0.2 })
    }
    this.mark('The Portaloo Row', cx + 52, cz - 12, 'joke')
  }

  _buildPirateCove(batch) {
    const zn = ZONES.find((z) => z.id === 'pirate')
    const [cx, cz] = zn.at
    const rng = this.rng
    const bx = cx - 46, bz = cz + 46          // bay centre (carved in terrain.js)

    // Ships ride at sea level rather than on the seabed.
    const afloat = (key, x, z, o = {}) => {
      if (!this.models.get(key)) return
      const yOff = WORLD.seaLevel - this.heightAt(x, z) - 0.6
      this.put(batch, key, x, z, { yOff, ...o })
    }
    afloat(P('ship-pirate-large'), bx - 16, bz - 8, { height: 22, rotY: 0.5 })
    afloat(P('ship-pirate-medium'), bx + 26, bz + 14, { height: 18, rotY: -1.1 })
    afloat(P('ship-pirate-small'), bx + 6, bz + 40, { height: 14, rotY: 2.3 })
    afloat(P('ship-wreck'), bx - 42, bz + 30, { height: 12, rotY: 1.9 })
    afloat(P('ship-ghost'), bx - 4, bz - 46, { height: 18, rotY: -0.4 })
    afloat(P('boat-row-large'), bx + 40, bz - 16, { height: 1.6, rotY: 0.8 })
    afloat(P('boat-row-small'), bx + 46, bz - 8, { height: 1.4, rotY: -0.2 })
    this.mark('The Black Barnacle', bx - 16, bz - 8, 'ship')
    this.mark('Rotten Cove', cx, cz, 'zone')

    // Docks reaching out from the shore.
    for (let i = 0; i < 12; i++) {
      this.put(batch, P('structure-platform-dock'), cx - 6 - i * 4.2, cz + 20 + i * 3.4,
        { width: 5, rotY: -0.68 })
    }
    for (let i = 0; i < 7; i++) {
      this.put(batch, P('structure-platform-dock-small'), cx + 12 + i * 4, cz + 40,
        { width: 4.4, rotY: 0 })
    }

    // Shore camp: towers, cannons, treasure.
    this.put(batch, P('tower-watch'), cx + 30, cz - 18, { height: 13, rotY: 0.4 })
    this.put(batch, P('tower-complete-small'), cx - 34, cz - 24, { height: 12, rotY: -0.6 })
    this.put(batch, P('structure'), cx + 4, cz - 6, { height: 5, rotY: 0.2 })
    this.put(batch, P('structure-roof'), cx + 4, cz - 6, { height: 2, yOff: 5, rotY: 0.2 })
    this.mark("Cap'n's Shack", cx + 4, cz - 6, 'building')

    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.33
      this.put(batch, rng.pick([P('cannon'), P('cannon-mobile')]),
        cx + Math.cos(a) * 44, cz + Math.sin(a) * 44 - 6, { height: 1.7, rotY: a + Math.PI / 2 })
    }
    this.scatter(batch, [P('cannon-ball')], cx + 10, cz - 10, 34, 28, { height: 0.5, minH: 1.2 })
    this.scatter(batch, [P('chest')], cx, cz, 76, 16, { height: 1.1, jitter: 0.2, minH: 1.2 })
    this.scatter(batch, [P('barrel'), P('crate'), P('crate-bottles')],
      cx, cz, 66, 70, { height: 1.2, jitter: 0.2, tilt: 0.08, minH: 1.2 })
    this.scatter(batch, [P('bottle'), P('bottle-large')], cx, cz, 60, 24,
      { height: 0.55, jitter: 0.2, tilt: 0.3, minH: 1.2 })
    this.scatter(batch, [P('flag-pirate'), P('flag-pirate-high'), P('flag-pirate-pennant')],
      cx, cz, 74, 18, { height: 7, minH: 1.4 })
    this.scatter(batch, [P('tool-shovel'), P('tool-paddle')], cx, cz, 70, 18,
      { height: 1.5, tilt: 0.25, minH: 1.2 })
    this.scatter(batch, [P('hole')], cx, cz, 70, 12, { width: 2.4, minH: 1.2 })

    // Palms and sand dressing.
    this.scatter(batch, [P('palm-straight'), P('palm-bend'), P('palm-detailed-straight'),
      P('palm-detailed-bend'), N('tree_palm'), N('tree_palmTall'), N('tree_palmBend')],
      cx, cz, zn.radius, 130, { height: 9.5, jitter: 0.25, tilt: 0.05, minH: 1.2 })
    this.scatter(batch, [P('patch-sand'), P('patch-sand-foliage')], cx, cz, zn.radius, 120,
      { width: 4, minH: 1.0 })
    this.scatter(batch, [P('rocks-sand-a'), P('rocks-sand-b'), P('rocks-a')], cx, cz, zn.radius, 80,
      { height: 1.6, jitter: 0.4, minH: 1.0 })
    this.scatter(batch, [N('cactus_tall'), N('cactus_short')], cx + 40, cz - 50, 40, 26,
      { height: 2.4, jitter: 0.3, minH: 1.5 })
  }
}
