import * as THREE from 'three'

/**
 * Every round generates one themed sandbox rather than a single map with
 * districts. Each theme owns its ground colour, lighting, music, spawn
 * tables and a `build` routine that lays out its landmarks.
 *
 * Adding a world means adding an entry here — nothing else needs to know.
 */

export const WORLD_SIZE = 400
export const WORLD_HALF = WORLD_SIZE / 2

// Path helpers for the asset folders.
const N = (f) => `assets/nature/${f}.glb`
const P = (f) => `assets/pirate/${f}.glb`
const T = (f) => `assets/town/${f}.glb`
const F = (f) => `assets/food/${f}.glb`
const H = (f) => `assets/holiday/${f}.glb`
const C = (f) => `assets/castle/${f}.glb`
const S = (f) => `assets/survival/${f}.glb`
const K = (f) => `assets/spooky/${f}.glb`
const FARM = (n) => `farm:${n}`

/* Shared scatter sets, so themes read as recipes rather than lists. */
const GRASS = [N('grass'), N('grass_large'), N('grass_leafs')]
const FLOWERS = [N('flower_redA'), N('flower_yellowA'), N('flower_purpleA'), N('flower_redC')]
const ROCKS_SMALL = [N('rock_smallA'), N('rock_smallC'), N('stone_smallB')]
const ROCKS_BIG = [N('rock_largeA'), N('rock_largeC'), N('rock_tallA'), N('stone_largeA')]
const BROADLEAF = [N('tree_default'), N('tree_oak'), N('tree_fat'), N('tree_detailed'), N('tree_tall')]
const PINES = [N('tree_pineTallA'), N('tree_pineRoundA'), N('tree_pineSmallA'), N('tree_cone')]
const PALMS = [P('palm-straight'), P('palm-bend'), P('palm-detailed-straight'), N('tree_palmTall')]

export const THEMES = [
  /* ══════════════════════════════════════════════════════════════════
     FARM — the classic. Densest cow population; the friendliest start.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'farm',
    name: 'Sunnyside Farm',
    icon: '🐄',
    blurb: 'Cows everywhere. Beam them all!',
    ground: 0x9ccc5a,
    sand: 0xe8d7a6,
    rock: 0x8d8b86,
    sky: 'assets/sky/Panorama_Sky_01-512x512.png',
    fog: { color: 0xbfd9f2, near: 210, far: 460 },
    sun: { color: 0xfff2d6, intensity: 2.5 },
    hemi: { sky: 0xd8ecff, ground: 0x5a6b3a, intensity: 1.35 },
    music: 'assets/audio/music/farm.ogg',
    critters: { cow: 34, calf: 14, pig: 14, sheep: 16, chicken: 18, bull: 5 },
    npcs: ['farmer', 'farmer', 'farmer', 'vet', 'rambler'],
    npcCount: 12,
    loot: ['pizza', 'burger', 'cake', 'watermelon', 'turkey', 'barrel', 'haystack'],
    models: [
      ...GRASS, ...FLOWERS, ...ROCKS_SMALL, ...BROADLEAF,
      N('crops_cornStageD'), N('crops_cornStageC'), N('crops_wheatStageB'),
      N('crops_dirtRow'), N('crop_pumpkin'), N('crop_melon'), N('crop_carrot'),
      N('log_stack'), N('pot_large'), N('sign'),
    ],
    farmModels: ['Barn', 'BigBarn', 'OpenBarn', 'SmallBarn', 'Silo', 'Silo_House',
      'Windmill', 'TowerWindmill', 'WaterTower', 'Well', 'ChickenCoop', 'Fence', 'Fence2'],
    extraModels: ['tractor'],

    build(w, b) {
      const rng = w.rng
      // Two farmyards so the map has more than one focal point.
      for (const [cx, cz, flip] of [[-70, -50, 1], [78, 62, -1]]) {
        w.put(b, FARM('BigBarn'), cx, cz, { height: 16, rotY: 0.2 * flip })
        w.put(b, FARM('Barn'), cx + 34 * flip, cz - 6, { height: 12, rotY: -0.5 })
        w.put(b, FARM('OpenBarn'), cx + 6, cz + 30, { height: 10, rotY: Math.PI })
        w.put(b, FARM('Silo'), cx - 28 * flip, cz - 26, { height: 17 })
        w.put(b, FARM('Silo_House'), cx - 8, cz - 40, { height: 17 })
        w.put(b, FARM('WaterTower'), cx + 44 * flip, cz + 30, { height: 13 })
        w.put(b, FARM('Well'), cx + 4, cz + 6, { height: 3 })
        w.put(b, FARM('ChickenCoop'), cx - 44 * flip, cz - 2, { height: 4 })
        w.put(b, 'tractor', cx + 18, cz + 10, { height: 3.6, rotY: 2.1 })
        w.mark('Farmyard', cx, cz, 'zone')
      }
      w.put(b, FARM('Windmill'), 6, -128, { height: 20, rotY: -0.3 })
      w.put(b, FARM('TowerWindmill'), -120, 40, { height: 21, rotY: 0.6 })
      w.mark('The Old Windmill', 6, -128, 'landmark')

      // Paddocks: where most of the herd lives.
      w.paddocks = [
        { x: -60, z: 40, w: 76, h: 56 },
        { x: 66, z: -46, w: 66, h: 50 },
        { x: -10, z: 106, w: 70, h: 44 },
      ]
      for (const p of w.paddocks) {
        w.fenceRect(b, FARM(rng.chance(0.5) ? 'Fence' : 'Fence2'), p.x, p.z, p.w, p.h, 4.4,
          { height: 1.7 })
      }

      // Crop strips.
      for (let f = 0; f < 6; f++) {
        const ox = -30 + f * 14
        const crop = rng.pick([N('crops_cornStageD'), N('crops_cornStageC'), N('crops_wheatStageB')])
        for (let i = 0; i < 20; i++) {
          const oz = -150 + i * 2.6
          w.put(b, N('crops_dirtRow'), ox, oz, { width: 2.8, rotY: 0 })
          w.put(b, crop, ox, oz, { height: 2.4, rotY: 0, jitter: 0.12 })
        }
      }
      w.scatter(b, [N('crop_pumpkin'), N('crop_melon'), N('crop_carrot')], 106, -110, 30, 70,
        { height: 1.1, jitter: 0.25 })
      w.mark('The Pumpkin Patch', 106, -110, 'field')

      w.scatter(b, BROADLEAF, 0, 0, WORLD_HALF - 30, 120, { height: 9, jitter: 0.3 })
      w.scatter(b, GRASS, 0, 0, WORLD_HALF - 20, 900, { height: 0.9, jitter: 0.4 })
      w.scatter(b, FLOWERS, 0, 0, WORLD_HALF - 20, 340, { height: 0.8, jitter: 0.3 })
      w.scatter(b, ROCKS_SMALL, 0, 0, WORLD_HALF - 20, 110, { height: 0.55, jitter: 0.5, tilt: 0.12 })
      w.scatter(b, [N('log_stack'), N('pot_large')], 0, 0, 150, 40, { height: 1.5, jitter: 0.3 })
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     PIRATE — a bay, ships at anchor, and cannons everywhere.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'pirate',
    name: 'Rotten Cove',
    icon: '🏴‍☠️',
    blurb: 'Yarr! Beam the pirates and their treasure.',
    ground: 0xe3d3a0,
    sand: 0xf0e2b8,
    rock: 0x9a9186,
    sky: 'assets/sky/Panorama_Sky_04-512x512.png',
    fog: { color: 0xcfe6f0, near: 200, far: 440 },
    sun: { color: 0xfff0cf, intensity: 2.7 },
    hemi: { sky: 0xcfeaff, ground: 0x9c8a5e, intensity: 1.4 },
    music: 'assets/audio/music/pirate.ogg',
    water: { level: -2.5, color: 0x2f8fbf },
    bay: { x: -70, z: 80, radius: 130, depth: 16 },
    critters: { chicken: 22, pig: 16, cow: 14, sheep: 12, calf: 8 },
    npcs: ['pirate', 'pirate', 'pirate', 'captain'],
    npcCount: 20,
    loot: ['chest', 'barrel', 'cannonball', 'pizza', 'turkey', 'bottle'],
    models: [
      ...PALMS, ...ROCKS_SMALL, ...GRASS,
      P('ship-pirate-large'), P('ship-pirate-medium'), P('ship-pirate-small'),
      P('ship-wreck'), P('ship-ghost'), P('boat-row-large'), P('boat-row-small'),
      P('cannon'), P('cannon-mobile'), P('cannon-ball'), P('chest'), P('crate'),
      P('crate-bottles'), P('barrel'), P('bottle'), P('bottle-large'),
      P('flag-pirate'), P('flag-pirate-high'), P('flag-pirate-pennant'),
      P('structure-platform-dock'), P('structure-platform-dock-small'), P('structure'),
      P('structure-roof'), P('tower-watch'), P('tower-complete-small'),
      P('patch-sand'), P('patch-sand-foliage'), P('rocks-sand-a'), P('rocks-sand-b'),
      P('tool-shovel'), P('tool-paddle'), P('hole'), N('cactus_tall'),
    ],

    build(w, b) {
      const rng = w.rng
      const bx = -70, bz = 80
      const afloat = (key, x, z, o = {}) => {
        if (!w.models.get(key)) return
        w.put(b, key, x, z, { yOff: w.seaLevel - w.heightAt(x, z) - 0.6, ...o })
      }
      afloat(P('ship-pirate-large'), bx - 14, bz - 10, { height: 26, rotY: 0.5 })
      afloat(P('ship-pirate-medium'), bx + 30, bz + 16, { height: 21, rotY: -1.1 })
      afloat(P('ship-pirate-small'), bx + 4, bz + 46, { height: 16, rotY: 2.3 })
      afloat(P('ship-wreck'), bx - 48, bz + 34, { height: 14, rotY: 1.9 })
      afloat(P('ship-ghost'), bx - 6, bz - 52, { height: 21, rotY: -0.4 })
      afloat(P('boat-row-large'), bx + 46, bz - 18, { height: 1.9, rotY: 0.8 })
      w.mark('The Black Barnacle', bx - 14, bz - 10, 'ship')

      for (let i = 0; i < 14; i++) {
        w.put(b, P('structure-platform-dock'), bx + 44 - i * 4.4, bz - 34 + i * 3.6,
          { width: 5.4, rotY: -0.68 })
      }
      w.put(b, P('tower-watch'), 30, 10, { height: 15, rotY: 0.4 })
      w.put(b, P('tower-complete-small'), -34, -30, { height: 14, rotY: -0.6 })
      w.put(b, P('structure'), 6, -6, { height: 6, rotY: 0.2 })
      w.put(b, P('structure-roof'), 6, -6, { height: 2.4, yOff: 6, rotY: 0.2 })
      w.mark("Cap'n's Shack", 6, -6, 'building')

      for (let i = 0; i < 8; i++) {
        const a = -0.9 + i * 0.28
        w.put(b, rng.pick([P('cannon'), P('cannon-mobile')]),
          Math.cos(a) * 60, Math.sin(a) * 60 - 10, { height: 2.1, rotY: a + Math.PI / 2 })
      }
      w.scatter(b, [P('cannon-ball')], 14, -14, 40, 34, { height: 0.6 })
      w.scatter(b, [P('chest')], 0, 0, 150, 26, { height: 1.4, jitter: 0.2 })
      w.scatter(b, [P('barrel'), P('crate'), P('crate-bottles')], 0, 0, 140, 110,
        { height: 1.5, jitter: 0.2, tilt: 0.08 })
      w.scatter(b, [P('bottle'), P('bottle-large')], 0, 0, 130, 30, { height: 0.7, tilt: 0.3 })
      w.scatter(b, [P('flag-pirate'), P('flag-pirate-high'), P('flag-pirate-pennant')],
        0, 0, 150, 26, { height: 8.5 })
      w.scatter(b, [P('tool-shovel'), P('tool-paddle')], 0, 0, 150, 22, { height: 1.9, tilt: 0.25 })
      w.scatter(b, [P('hole')], 0, 0, 150, 16, { width: 2.8 })
      w.scatter(b, PALMS, 0, 0, WORLD_HALF - 25, 150, { height: 11, jitter: 0.25, tilt: 0.05 })
      w.scatter(b, [P('patch-sand'), P('patch-sand-foliage')], 0, 0, WORLD_HALF - 20, 130,
        { width: 5, minH: 0.2 })
      w.scatter(b, [P('rocks-sand-a'), P('rocks-sand-b')], 0, 0, WORLD_HALF - 20, 90,
        { height: 2, jitter: 0.4, minH: 0.2 })
      w.scatter(b, [N('cactus_tall')], 110, -110, 50, 24, { height: 3, jitter: 0.3 })
      w.scatter(b, GRASS, 0, 0, WORLD_HALF - 20, 320, { height: 0.9, jitter: 0.4 })
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     HOSPITAL — no medical assets exist, so it is built from repainted
     town modules. Patients in gowns are the gag.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'medical',
    name: 'St. Bovine Hospital',
    icon: '🏥',
    blurb: 'Beam up the doctors. And the patients!',
    ground: 0xb7d6a8,
    sand: 0xd9e0cc,
    rock: 0x9aa39c,
    sky: 'assets/sky/Panorama_Sky_01-512x512.png',
    fog: { color: 0xd6e8f2, near: 210, far: 460 },
    sun: { color: 0xfff7ea, intensity: 2.4 },
    hemi: { sky: 0xe4f2ff, ground: 0x6d7d5e, intensity: 1.4 },
    music: 'assets/audio/music/medical.ogg',
    critters: { cow: 24, chicken: 20, pig: 14, sheep: 14, calf: 10 },
    npcs: ['doctor', 'nurse', 'nurse', 'patient', 'patient', 'patient', 'vet'],
    npcCount: 46,
    loot: ['pizza', 'burger', 'donut', 'icecream', 'cake', 'portaloo'],
    models: [
      ...GRASS, ...FLOWERS, N('tree_small'), N('tree_default'),
      T('wall'), T('wall-door'), T('wall-window-glass'), T('wall-window-small'),
      T('wall-corner'), T('roof-flat'), T('road'), T('lantern'), T('hedge'),
      T('fountain-round'), T('fountain-round-detail'), T('cart'), T('cart-high'),
      T('stall-bench'), T('stall'), ...ROCKS_SMALL,
    ],
    extraModels: ['potty'],

    build(w, b) {
      /* Repaint town modules: clinical white walls, red roofs. Everything in
         these kits shares one palette-atlas material, so the colour has to
         replace the material rather than tint it. */
      const PALETTE = {
        wall: 0xf7fbfc, 'wall-door': 0xdfe9ec, 'wall-window-glass': 0xcfe6f2,
        'wall-window-small': 0xcfe6f2, 'wall-corner': 0xeef5f7, 'roof-flat': 0xd94a4a,
      }
      for (const [key, color] of Object.entries(PALETTE)) {
        const src = w.models.get(T(key))
        if (src) w.models.set(`med:${key}`, w.repaint(src.clone(true), color))
      }
      const road = w.models.get(T('road'))
      if (road) w.models.set('med:cross', w.repaint(road.clone(true), 0xd94a4a))
      for (const [k, c, tag] of [['cart', 0xfafcfc, 'w'], ['cart-high', 0xfafcfc, 'w'],
        ['cart', 0xe23b3b, 'r']]) {
        const src = w.models.get(T(k))
        if (src) w.models.set(`amb:${k}:${tag}`, w.repaint(src.clone(true), c))
      }

      const U = 5
      const wing = (ox, oz, cols, rows, rot = 0, storeys = 3) => {
        const cos = Math.cos(rot), sin = Math.sin(rot)
        for (let ix = 0; ix < cols; ix++) {
          for (let iz = 0; iz < rows; iz++) {
            const edge = ix === 0 || iz === 0 || ix === cols - 1 || iz === rows - 1
            const lx = (ix - (cols - 1) / 2) * U
            const lz = (iz - (rows - 1) / 2) * U
            const x = ox + lx * cos - lz * sin
            const z = oz + lx * sin + lz * cos
            if (edge) {
              const corner = (ix === 0 || ix === cols - 1) && (iz === 0 || iz === rows - 1)
              // wall.glb is a panel spanning Z, so the north/south runs turn.
              let face = rot
              if (iz === 0) face = rot + Math.PI / 2
              else if (iz === rows - 1) face = rot - Math.PI / 2
              else if (ix === 0) face = rot + Math.PI
              for (let s = 0; s < storeys; s++) {
                let key = 'wall'
                if (corner) key = 'wall-corner'
                else if (s === 0 && ix === (cols >> 1) && iz === rows - 1) key = 'wall-door'
                else if ((ix + iz + s) % 2 === 0) key = 'wall-window-glass'
                w.put(b, `med:${key}`, x, z, { height: U, rotY: face, yOff: s * U })
              }
            }
            w.put(b, 'med:roof-flat', x, z, { width: U, rotY: rot, yOff: storeys * U })
          }
        }
      }
      wing(0, -20, 9, 6, 0, 3)
      wing(-64, 30, 6, 5, Math.PI / 2, 2)
      wing(66, 34, 5, 5, 0, 2)
      w.mark('St. Bovine Hospital', 0, -20, 'zone')
      w.mark('A&E Department', -64, 30, 'building')

      for (let i = -4; i <= 4; i++) {
        w.put(b, 'med:cross', i * 5, 26, { width: 5 })
        w.put(b, 'med:cross', 0, 26 + i * 5, { width: 5 })
      }
      /* A long straight run of flat tiles staircases over the undulating
         terrain and reads as scattered debris, so the forecourt cross is the
         only paving; the approach is marked with lamps instead. */
      w.put(b, 'amb:cart:w', -20, 44, { height: 3, rotY: 0.2 })
      w.put(b, 'amb:cart-high:w', 16, 44, { height: 3.4, rotY: -0.3 })
      w.put(b, 'amb:cart:r', 52, 54, { height: 3, rotY: 1.6 })
      w.put(b, T('fountain-round'), 2, -74, { width: 9 })
      w.put(b, T('fountain-round-detail'), 2, -74, { width: 9 })
      w.mark('Hospital Fountain', 2, -74, 'landmark')

      for (let i = 0; i < 18; i++) w.put(b, T('lantern'), -76 + i * 9, 62, { height: 4.2 })
      const hedgeRow = (x1, z1, x2, z2) => {
        const dx = x2 - x1, dz = z2 - z1
        const n = Math.max(1, Math.round(Math.hypot(dx, dz) / 2.6))
        const rot = Math.atan2(dx, dz)
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n
          w.put(b, T('hedge'), x1 + dx * t, z1 + dz * t, { width: 2.8, rotY: rot })
        }
      }
      hedgeRow(-90, 48, -30, 48); hedgeRow(30, 48, 90, 48)
      hedgeRow(-90, 48, -90, 4); hedgeRow(90, 48, 90, 4)
      hedgeRow(-40, -96, 44, -96)

      // Portable loos: reliably the funniest thing on the map.
      for (let i = 0; i < 7; i++) w.put(b, 'potty', 82 + (i % 4) * 6, -30 + Math.floor(i / 4) * 7,
        { height: 3, rotY: -0.2 })
      w.mark('The Portaloo Row', 90, -28, 'joke')

      w.scatter(b, [N('tree_small'), N('tree_default')], 0, 0, WORLD_HALF - 25, 190,
        { height: 8, jitter: 0.3, minR: 96 })
      w.scatter(b, [T('lantern')], 0, 0, WORLD_HALF - 30, 70, { height: 4.2, minR: 100 })
      w.scatter(b, [T('hedge')], 0, 0, WORLD_HALF - 25, 90, { width: 3, minR: 100 })
      w.scatter(b, [T('stall'), T('cart')], 0, 0, WORLD_HALF - 40, 40, { height: 3, minR: 96 })
      w.scatter(b, GRASS, 0, 0, WORLD_HALF - 20, 1100, { height: 1.0, jitter: 0.4 })
      w.scatter(b, FLOWERS, 0, 0, WORLD_HALF - 20, 520, { height: 0.9, jitter: 0.3 })
      w.scatter(b, ROCKS_SMALL, 0, 0, WORLD_HALF - 20, 110, { height: 0.6, jitter: 0.5, tilt: 0.12 })
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     SPOOKY — dark but never grim. Everything cheerful from the nature kit
     is repainted; bright autumn trees in a graveyard read as a park.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'spooky',
    name: 'Boo Hill Graveyard',
    icon: '👻',
    blurb: 'Spooky! Beam up the skeletons.',
    ground: 0x3f4a3e,
    sand: 0x4c4a44,
    rock: 0x5e5e5a,
    sky: null,
    skyColor: 0x241f3a,
    fog: { color: 0x2f2a4a, near: 150, far: 380 },
    sun: { color: 0xb8d8ff, intensity: 1.35 },
    hemi: { sky: 0x8878c8, ground: 0x242a22, intensity: 1.1 },
    // Lifted so a five-year-old can still tell a cow from a gravestone.
    ambient: 0.7,
    music: 'assets/audio/music/wilds.ogg',
    critters: { cow: 22, sheep: 16, chicken: 20, pig: 14 },
    npcs: ['skeleton', 'skeleton', 'skeleton', 'skelemage', 'ghoul'],
    npcCount: 30,
    loot: ['pumpkin', 'chest', 'barrel', 'cake', 'skull'],
    models: [
      K('tomb-01'), K('tomb-02'), K('tomb-03'), K('iron-fence'), K('iron-gate'),
      K('iron-pillar'), K('skull'), K('bone'), K('candle'), K('candlestick'),
      K('dead-flower'), K('dead-grass'), K('dark-trunk-block'), K('red-leaves-block'),
      K('stone-table'), K('stone-chair'), K('ritual-book'),
      N('tree_thin'), N('tree_tall'), N('tree_default'), N('stump_old'), N('log'),
      N('mushroom_red'), N('mushroom_redGroup'), N('rock_tallA'), N('stone_tallC'),
      N('statue_obelisk'), N('statue_head'), N('statue_column'),
      N('crop_pumpkin'), N('campfire_stones'), N('campfire_logs'), N('grass_leafs'),
    ],

    build(w, b) {
      const rng = w.rng
      /* The nature kit is relentlessly cheerful — spring greens and bright
         autumn oranges. Repaint the pieces this world borrows so the whole
         graveyard reads as one place. */
      const DEAD = {
        tree_thin: 0x3a3348, tree_tall: 0x322c40, tree_default: 0x2e2a3c,
        stump_old: 0x4a3f38, log: 0x4a3f38,
        rock_tallA: 0x585a60, stone_tallC: 0x53555c,
        statue_obelisk: 0x6a6c74, statue_head: 0x6a6c74, statue_column: 0x64666e,
        grass_leafs: 0x4a5442, crop_pumpkin: 0xc9701f,
        mushroom_red: 0x8c3b4a, mushroom_redGroup: 0x8c3b4a,
      }
      for (const [name, color] of Object.entries(DEAD)) {
        const src = w.models.get(N(name))
        if (src) w.models.set(`dead:${name}`, w.repaint(src.clone(true), color))
      }
      const D = (n) => `dead:${n}`

      // Grave plots — the defining feature. Big enough to read from the air.
      for (let plot = 0; plot < 6; plot++) {
        const a = (plot / 6) * Math.PI * 2
        const ox = Math.cos(a) * 105, oz = Math.sin(a) * 105
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            w.put(b, rng.pick([K('tomb-01'), K('tomb-02'), K('tomb-03')]),
              ox + (c - 1.5) * 11, oz + (r - 1.5) * 11,
              { height: 5, rotY: -a + rng.range(-0.12, 0.12) })
          }
        }
        w.fenceRect(b, K('iron-fence'), ox, oz, 54, 54, 4.4, { height: 3.4 })
        for (const [dx, dz] of [[-27, -27], [27, -27], [-27, 27], [27, 27]]) {
          w.put(b, K('iron-pillar'), ox + dx, oz + dz, { height: 4.6 })
        }
        w.mark('Grave Plot', ox, oz, 'zone')
      }

      // A ritual circle, because a seven-year-old will go there first.
      w.put(b, K('stone-table'), 0, 0, { height: 3 })
      w.put(b, K('ritual-book'), 0, 0, { height: 0.8, yOff: 3 })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        w.put(b, K('candlestick'), Math.cos(a) * 14, Math.sin(a) * 14, { height: 3.2 })
        w.put(b, K('stone-chair'), Math.cos(a) * 24, Math.sin(a) * 24, { height: 3, rotY: -a })
      }
      w.put(b, D('statue_obelisk'), 0, -46, { height: 20 })
      w.mark('The Ritual Circle', 0, 0, 'landmark')
      w.mark('The Black Obelisk', 0, -46, 'landmark')

      w.scatter(b, [D('tree_thin'), D('tree_tall'), D('tree_default'), K('dark-trunk-block')],
        0, 0, WORLD_HALF - 25, 200, { height: 13, jitter: 0.35, tilt: 0.07 })
      // red-leaves-block is a voxel canopy piece; scattered on the ground it
      // just reads as a rug, so it sits on top of the dead trunks instead.
      for (let i = 0; i < 40; i++) {
        const spot = w.randomSpot(rng, { radius: WORLD_HALF - 30 })
        if (!spot) continue
        w.put(b, K('dark-trunk-block'), spot.x, spot.z, { height: 9 })
        w.put(b, K('red-leaves-block'), spot.x, spot.z, { height: 5, yOff: 8 })
      }
      w.scatter(b, [K('skull'), K('bone')], 0, 0, WORLD_HALF - 25, 150, { height: 1.2, tilt: 0.4 })
      w.scatter(b, [K('candle')], 0, 0, WORLD_HALF - 30, 110, { height: 1.3 })
      w.scatter(b, [K('dead-flower'), K('dead-grass')], 0, 0, WORLD_HALF - 20, 600,
        { height: 1.1, jitter: 0.4 })
      w.scatter(b, [D('mushroom_red'), D('mushroom_redGroup')], 0, 0, WORLD_HALF - 25, 120,
        { height: 1.8, jitter: 0.4 })
      w.scatter(b, [D('rock_tallA'), D('stone_tallC'), D('statue_head'), D('statue_column')],
        0, 0, WORLD_HALF - 25, 110, { height: 4.4, jitter: 0.5, tilt: 0.1 })
      w.scatter(b, [D('crop_pumpkin')], 0, 0, WORLD_HALF - 30, 100, { height: 1.8, jitter: 0.3 })
      w.scatter(b, [D('stump_old'), D('log')], 0, 0, WORLD_HALF - 25, 80, { height: 2, jitter: 0.3 })
      w.scatter(b, [D('grass_leafs')], 0, 0, WORLD_HALF - 20, 400, { height: 1.1, jitter: 0.4 })
      for (const [x, z] of [[-90, 110], [100, -100], [60, 130], [-120, -60]]) {
        w.put(b, N('campfire_stones'), x, z, { height: 1.1 })
        w.put(b, N('campfire_logs'), x, z, { height: 1.9 })
      }
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     SNOW — Christmas village. Snowmen and reindeer are the targets.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'snow',
    name: 'Jinglebell Valley',
    icon: '⛄',
    blurb: 'Snowmen, reindeer and presents!',
    ground: 0xd6e4ee,
    sand: 0xc7d8e4,
    rock: 0x8f9aa4,
    sky: 'assets/sky/Panorama_Sky_04-512x512.png',
    fog: { color: 0xdfeaf5, near: 170, far: 400 },
    sun: { color: 0xfff4e0, intensity: 2.2 },
    hemi: { sky: 0xdceeff, ground: 0x8fa2b0, intensity: 1.25 },
    music: 'assets/audio/music/wilds.ogg',
    critters: { sheep: 24, cow: 20, calf: 14, chicken: 16, pig: 12 },
    npcs: ['elf', 'elf', 'rambler', 'santa'],
    npcCount: 18,
    loot: ['present', 'present', 'cake', 'donut', 'icecream', 'snowman'],
    models: [
      H('cabin-wall'), H('cabin-wall-wreath'), H('cabin-window-a'), H('cabin-doorway'),
      H('cabin-roof'), H('cabin-roof-snow'), H('cabin-roof-point'), H('cabin-corner'),
      H('cabin-fence'), H('snowman'), H('snowman-hat'), H('reindeer'), H('sled'),
      H('sled-long'), H('present-a-cube'), H('present-b-round'), H('present-a-rectangle'),
      H('candy-cane-red'), H('candy-cane-green'), H('tree-snow-a'), H('tree-snow-b'),
      H('tree-snow-c'), H('tree-decorated-snow'), H('tree-decorated'), H('lantern'),
      H('snow-pile'), H('snowflake-a'), H('bench'), H('lights-colored'), H('wreath'),
      H('train-locomotive'), H('train-wagon'), H('trainset-rail-straight'), H('nutcracker'),
      N('rock_smallA'), N('stone_smallB'),
    ],

    build(w, b) {
      const rng = w.rng
      // A ring of cabins around a village green.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const cx = Math.cos(a) * 74, cz = Math.sin(a) * 74
        const U = 4.5
        for (let ix = -1; ix <= 1; ix++) {
          for (let iz = -1; iz <= 1; iz++) {
            if (Math.abs(ix) !== 1 && Math.abs(iz) !== 1) continue
            const key = (ix === 0 && iz === 1) ? H('cabin-doorway')
              : (ix === 0 ? H('cabin-window-a') : H('cabin-wall'))
            let face = -a
            if (iz === 1) face = -a + Math.PI / 2
            else if (iz === -1) face = -a - Math.PI / 2
            w.put(b, key, cx + ix * U, cz + iz * U, { height: U, rotY: face })
            w.put(b, H('cabin-roof-snow'), cx + ix * U, cz + iz * U,
              { width: U, rotY: -a, yOff: U })
          }
        }
        w.put(b, H('cabin-wall-wreath'), cx, cz + U, { height: U, rotY: -a + Math.PI / 2 })
        w.mark('Cabin', cx, cz, 'building')
      }
      w.mark('Jinglebell Village', 0, 0, 'zone')

      // Toy train on a loop.
      const R = 132
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2
        w.put(b, H('trainset-rail-straight'), Math.cos(a) * R, Math.sin(a) * R,
          { width: 9, rotY: -a + Math.PI / 2 })
      }
      w.put(b, H('train-locomotive'), R, 0, { height: 4, rotY: Math.PI / 2 })
      w.put(b, H('train-wagon'), Math.cos(0.06) * R, Math.sin(0.06) * R, { height: 3.6, rotY: Math.PI / 2 })
      w.mark('The Toy Train', R, 0, 'landmark')

      // Snowmen everywhere — the signature target of this world.
      w.scatter(b, [H('snowman'), H('snowman-hat')], 0, 0, WORLD_HALF - 30, 70,
        { height: 3, jitter: 0.25 })
      w.scatter(b, [H('tree-snow-a'), H('tree-snow-b'), H('tree-snow-c'),
        H('tree-decorated-snow'), H('tree-decorated')], 0, 0, WORLD_HALF - 25, 200,
        { height: 10, jitter: 0.3 })
      w.scatter(b, [H('present-a-cube'), H('present-b-round'), H('present-a-rectangle')],
        0, 0, WORLD_HALF - 30, 110, { height: 1.4, jitter: 0.3 })
      w.scatter(b, [H('candy-cane-red'), H('candy-cane-green')], 0, 0, WORLD_HALF - 25, 90,
        { height: 3.4 })
      w.scatter(b, [H('reindeer')], 0, 0, WORLD_HALF - 35, 26, { height: 3.4, jitter: 0.15 })
      w.scatter(b, [H('sled'), H('sled-long')], 0, 0, WORLD_HALF - 35, 30, { height: 1.2, tilt: 0.15 })
      w.scatter(b, [H('snow-pile')], 0, 0, WORLD_HALF - 20, 220, { width: 4, jitter: 0.4 })
      w.scatter(b, [H('lantern'), H('nutcracker')], 0, 0, WORLD_HALF - 30, 60, { height: 3.2 })
      w.scatter(b, [N('rock_smallA'), N('stone_smallB')], 0, 0, WORLD_HALF - 20, 90,
        { height: 0.6, jitter: 0.5, tilt: 0.12 })
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     CASTLE — a siege in progress. Knights, catapults, towers.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'castle',
    name: 'Siege of Castle Moo',
    icon: '🏰',
    blurb: 'Knights, catapults and a big castle!',
    ground: 0x8fb659,
    sand: 0xd8c9a0,
    rock: 0x8d8b86,
    sky: 'assets/sky/Panorama_Sky_01-512x512.png',
    fog: { color: 0xc6d8e8, near: 200, far: 450 },
    sun: { color: 0xfff0d8, intensity: 2.5 },
    hemi: { sky: 0xd4e8ff, ground: 0x5f6f42, intensity: 1.35 },
    music: 'assets/audio/music/pirate.ogg',
    critters: { cow: 28, sheep: 20, pig: 14, chicken: 18, bull: 5 },
    npcs: ['knight', 'knight', 'archer', 'wizard', 'farmer'],
    npcCount: 26,
    loot: ['chest', 'barrel', 'turkey', 'cake', 'cannonball', 'pizza'],
    models: [
      C('tower-square-base'), C('tower-square-mid'), C('tower-square-mid-windows'),
      C('tower-square-top'), C('tower-square-roof'), C('tower-hexagon-base'),
      C('tower-hexagon-mid'), C('tower-hexagon-top'), C('tower-hexagon-roof'),
      C('wall'), C('wall-corner'), C('wall-doorway'), C('wall-half'), C('wall-pillar'),
      C('gate'), C('metal-gate'), C('siege-catapult'), C('siege-trebuchet'),
      C('siege-ballista'), C('siege-ram'), C('siege-tower'), C('siege-catapult-demolished'),
      C('flag'), C('flag-wide'), C('flag-pennant'), C('flag-banner-long'),
      C('stairs-stone'), C('bridge-straight'), C('rocks-large'), C('rocks-small'),
      C('tree-large'), C('tree-small'), C('tree-log'),
      ...GRASS, ...FLOWERS, ...ROCKS_SMALL,
    ],

    build(w, b) {
      const rng = w.rng
      const U = 6

      // Curtain wall around a keep.
      const half = 8
      for (let i = -half; i <= half; i++) {
        for (const [x, z, rot] of [
          [i * U, -half * U, 0], [i * U, half * U, 0],
          [-half * U, i * U, Math.PI / 2], [half * U, i * U, Math.PI / 2],
        ]) {
          const isGate = i === 0 && z === half * U
          w.put(b, isGate ? C('wall-doorway') : C('wall'), x, z, { height: U, rotY: rot })
        }
      }
      for (const [x, z] of [[-half * U, -half * U], [half * U, -half * U],
        [-half * U, half * U], [half * U, half * U]]) {
        w.put(b, C('tower-square-base'), x, z, { height: U * 1.2 })
        w.put(b, C('tower-square-mid-windows'), x, z, { height: U * 1.2, yOff: U * 1.2 })
        w.put(b, C('tower-square-top'), x, z, { height: U * 0.8, yOff: U * 2.4 })
        w.put(b, C('tower-square-roof'), x, z, { height: U, yOff: U * 3.2 })
        w.put(b, C('flag'), x, z, { height: U * 0.9, yOff: U * 4.2 })
      }
      // The keep.
      w.put(b, C('tower-hexagon-base'), 0, 0, { height: 12 })
      w.put(b, C('tower-hexagon-mid'), 0, 0, { height: 12, yOff: 12 })
      w.put(b, C('tower-hexagon-top'), 0, 0, { height: 8, yOff: 24 })
      w.put(b, C('tower-hexagon-roof'), 0, 0, { height: 10, yOff: 32 })
      w.mark('Castle Moo', 0, 0, 'zone')

      // Siege camp outside the walls.
      const siege = [C('siege-catapult'), C('siege-trebuchet'), C('siege-ballista'),
        C('siege-ram'), C('siege-tower')]
      for (let i = 0; i < 12; i++) {
        const a = 0.5 + i * 0.42
        const r = 96 + rng.range(-12, 20)
        w.put(b, rng.pick(siege), Math.cos(a) * r, Math.sin(a) * r,
          { height: 7, rotY: -a + Math.PI })
      }
      w.put(b, C('siege-catapult-demolished'), -80, -80, { height: 5, rotY: 1.2 })
      w.mark('The Siege Camp', 110, 60, 'zone')

      w.scatter(b, [C('flag-wide'), C('flag-pennant'), C('flag-banner-long')],
        0, 0, WORLD_HALF - 30, 50, { height: 8, minR: 60 })
      w.scatter(b, [C('tree-large'), C('tree-small')], 0, 0, WORLD_HALF - 25, 140,
        { height: 9.5, jitter: 0.3, minR: 70 })
      w.scatter(b, [C('rocks-large'), C('rocks-small'), ...ROCKS_SMALL],
        0, 0, WORLD_HALF - 20, 130, { height: 1.6, jitter: 0.5, tilt: 0.12 })
      w.scatter(b, [C('tree-log')], 0, 0, WORLD_HALF - 25, 50, { height: 1.4, jitter: 0.3 })
      w.scatter(b, GRASS, 0, 0, WORLD_HALF - 20, 700, { height: 0.9, jitter: 0.4 })
      w.scatter(b, FLOWERS, 0, 0, WORLD_HALF - 20, 280, { height: 0.8, jitter: 0.3 })
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     JUNGLE — survival camp on a wild island.
     ═════════════════════════════════════════════════════════════════ */
  {
    id: 'jungle',
    name: 'Lost Jungle Camp',
    icon: '🌴',
    blurb: 'Explorers, tents and wild animals!',
    ground: 0x5f9e3c,
    sand: 0xe0d3a2,
    rock: 0x7d8478,
    sky: 'assets/sky/Panorama_Sky_04-512x512.png',
    fog: { color: 0xbfdcc4, near: 160, far: 400 },
    sun: { color: 0xfff6dc, intensity: 2.4 },
    hemi: { sky: 0xd4f0d8, ground: 0x3f5a2c, intensity: 1.4 },
    music: 'assets/audio/music/wilds.ogg',
    water: { level: -2.5, color: 0x2f9fa8 },
    bay: { x: 96, z: -100, radius: 110, depth: 14 },
    critters: { pig: 22, chicken: 24, cow: 18, sheep: 14, calf: 10 },
    npcs: ['explorer', 'explorer', 'rambler', 'vet'],
    npcCount: 18,
    loot: ['barrel', 'chest', 'watermelon', 'turkey', 'pizza', 'fish'],
    models: [
      S('tent'), S('tent-canvas'), S('tent-canvas-half'), S('structure'),
      S('structure-roof'), S('structure-canvas'), S('campfire-pit'), S('campfire-stand'),
      S('campfire-fishing-stand'), S('workbench'), S('workbench-anvil'), S('workbench-grind'),
      S('barrel'), S('box'), S('box-large'), S('chest'), S('bucket'), S('bedroll'),
      S('signpost'), S('fence'), S('fence-fortified'), S('resource-wood'),
      S('resource-planks'), S('resource-stone'), S('tool-axe'), S('tool-pickaxe'),
      S('fish'), S('fish-large'), S('rock-a'), S('rock-b'), S('rock-flat-grass'),
      S('tree'), S('tree-tall'), S('tree-trunk'), S('tree-log'),
      ...PALMS, ...GRASS, ...ROCKS_BIG, N('plant_bushLarge'), N('hanging_moss'),
      N('mushroom_tanGroup'), N('lily_large'), N('canoe'),
    ],

    build(w, b) {
      const rng = w.rng
      // Base camp.
      for (const [cx, cz] of [[-60, 30], [70, 70], [-90, -80]]) {
        w.put(b, S('campfire-pit'), cx, cz, { height: 1 })
        w.put(b, S('campfire-stand'), cx, cz, { height: 2.4 })
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4
          w.put(b, rng.pick([S('tent'), S('tent-canvas'), S('tent-canvas-half')]),
            cx + Math.cos(a) * 14, cz + Math.sin(a) * 14, { height: 4, rotY: -a + Math.PI })
        }
        w.put(b, S('workbench'), cx + 18, cz - 6, { height: 2.2, rotY: 0.5 })
        w.put(b, S('signpost'), cx - 16, cz + 10, { height: 3 })
        w.mark('Base Camp', cx, cz, 'zone')
      }
      w.put(b, S('structure'), 0, 0, { height: 6 })
      w.put(b, S('structure-roof'), 0, 0, { height: 2.4, yOff: 6 })
      w.mark('The Long Hut', 0, 0, 'building')

      w.scatter(b, [S('tree'), S('tree-tall'), ...PALMS], 0, 0, WORLD_HALF - 25, 260,
        { height: 12, jitter: 0.35, tilt: 0.05 })
      w.scatter(b, [N('plant_bushLarge'), N('hanging_moss')], 0, 0, WORLD_HALF - 20, 240,
        { height: 2.4, jitter: 0.4 })
      w.scatter(b, [S('barrel'), S('box'), S('box-large'), S('chest'), S('bucket')],
        0, 0, WORLD_HALF - 30, 120, { height: 1.5, jitter: 0.25, tilt: 0.08 })
      w.scatter(b, [S('resource-wood'), S('resource-planks'), S('resource-stone'), S('tree-log')],
        0, 0, WORLD_HALF - 25, 90, { height: 1.4, jitter: 0.3 })
      w.scatter(b, [S('tool-axe'), S('tool-pickaxe'), S('bedroll')], 0, 0, WORLD_HALF - 30, 50,
        { height: 1.4, tilt: 0.2 })
      w.scatter(b, [S('rock-a'), S('rock-b'), ...ROCKS_BIG], 0, 0, WORLD_HALF - 20, 130,
        { height: 3, jitter: 0.5, tilt: 0.1 })
      w.scatter(b, [N('mushroom_tanGroup')], 0, 0, WORLD_HALF - 25, 90, { height: 1.5, jitter: 0.4 })
      w.scatter(b, GRASS, 0, 0, WORLD_HALF - 20, 800, { height: 1.0, jitter: 0.4 })
      w.scatter(b, [S('fish'), S('fish-large')], 96, -100, 60, 30, { height: 1, minH: -99, tilt: 0.4 })
    },
  },
]

export function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
