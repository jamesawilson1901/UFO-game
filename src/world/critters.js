import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural farm animals.
 *
 * No cow model exists in any of the source packs, so the critters are built
 * from primitives here. That turns out to be an advantage: they can be
 * recoloured, resized and re-proportioned for free, which is where most of
 * the comedy comes from — the same builder makes a dainty calf and an
 * absolutely enormous prize bull.
 *
 * Everything is flat-shaded to sit alongside the Kenney/Quaternius kits.
 */

/*
 * Colour is baked into vertices rather than carried by per-part materials.
 * A cow is about thirty primitives; as separate meshes that is thirty draw
 * calls each, and there are well over a hundred animals in the world. Merging
 * each animated group into one vertex-coloured mesh takes a critter from ~30
 * draw calls to 7, and every critter in the game shares one material.
 */
let SHARED_MAT = null
function sharedMaterial() {
  if (!SHARED_MAT) {
    SHARED_MAT = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0,
    })
    // Lives for the whole session; end-of-round teardown must not free it.
    SHARED_MAT.userData.shared = true
  }
  return SHARED_MAT
}

// Shared geometry — one allocation per shape, reused across every critter.
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 3, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
}

/** Collects coloured primitives for one animated group, then merges them. */
class PartBin {
  constructor() { this.geoms = [] }

  add(geo, colorHex, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) {
    const g = geo.clone()
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    )
    g.applyMatrix4(m)
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal'].includes(name)) g.deleteAttribute(name)
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    const n = g.attributes.position.count
    const c = new THREE.Color(colorHex)
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    this.geoms.push(g)
    return this
  }

  /** Merge into a single mesh and attach it to `parent`. */
  flush(parent) {
    if (!this.geoms.length) return null
    const merged = this.geoms.length === 1 ? this.geoms[0] : mergeGeometries(this.geoms, false)
    if (!merged) return null
    const mesh = new THREE.Mesh(merged, sharedMaterial())
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    if (this.geoms.length > 1) for (const g of this.geoms) g.dispose()
    this.geoms = []
    return mesh
  }
}

/* ── species definitions ──────────────────────────────────────────────
   Sizes are in world units; 1 unit ≈ 1 metre. They are deliberately larger
   than life — from the saucer's altitude a realistically-sized cow is an
   unidentifiable speck, and the whole game is about recognising your target.
   `points` roughly tracks how hard something is to catch.               */
export const SPECIES = {
  cow: {
    label: 'Cow', icon: '🐄', points: 100, size: 2.6,
    body: 0xf4f1ea, patch: 0x3b3b45, snout: 0xffb3c6, horn: 0xe8dcc0,
    hasHorns: true, hasUdder: true, spots: 6, speed: 1.5, moo: 'cow-moo',
  },
  bull: {
    label: 'Prize Bull', icon: '🐂', points: 250, size: 3.3,
    body: 0x6b4423, patch: 0x3d2415, snout: 0xd98fa0, horn: 0xf0e6d0,
    hasHorns: true, hasUdder: false, spots: 2, speed: 2.6, moo: 'cow-moo',
    angry: true,
  },
  calf: {
    label: 'Calf', icon: '🐮', points: 60, size: 1.7,
    body: 0xfff8e7, patch: 0xc2703d, snout: 0xffc2d1, horn: 0xe8dcc0,
    hasHorns: false, hasUdder: false, spots: 4, speed: 2.2, moo: 'cow-moo',
  },
  pig: {
    label: 'Pig', icon: '🐖', points: 80, size: 2.0,
    body: 0xffb0c4, patch: 0xff87a3, snout: 0xff7fa0, horn: 0,
    hasHorns: false, hasUdder: false, spots: 3, speed: 2.4, ears: 'floppy',
    tail: 'curly', moo: 'slime_000',
  },
  sheep: {
    label: 'Sheep', icon: '🐑', points: 90, size: 2.1,
    body: 0xfaf7f2, patch: 0xe6e0d4, snout: 0x33313a, horn: 0xd9cbb0,
    hasHorns: false, hasUdder: false, spots: 0, speed: 2.0, fluffy: true,
    legColor: 0x33313a, moo: 'slime_002',
  },
  chicken: {
    label: 'Chicken', icon: '🐔', points: 40, size: 1.3,
    body: 0xfffdf6, patch: 0xffffff, snout: 0xffa62b, horn: 0xe23b3b,
    hasHorns: false, hasUdder: false, spots: 0, speed: 3.4, bird: true,
    legColor: 0xffa62b, moo: 'slime_000',
  },
}

/**
 * Build one critter.
 * @returns {{root: THREE.Group, legs: THREE.Object3D[], head: THREE.Object3D,
 *            tail: THREE.Object3D, def: object}}
 */
export function makeCritter(kind, rng) {
  const def = SPECIES[kind]
  if (!def) throw new Error(`unknown critter: ${kind}`)

  const s = def.size * (rng ? rng.range(0.9, 1.12) : 1)
  const root = new THREE.Group()
  const bodyMat = def.body
  const patchMat = def.patch
  const snoutMat = def.snout
  const hornMat = def.horn || null
  const legMat = def.legColor ?? def.patch
  const eyeWhite = 0xffffff
  const eyeBlack = 0x1a1a22

  // One bin per animated group: the torso, the head, each leg, the tail.
  const bodyBin = new PartBin()
  const headBin = new PartBin()
  const tailBin = new PartBin()

  const bodyLen = 1.5 * s
  const bodyH = 0.85 * s
  const bodyW = 0.8 * s
  const legLen = (def.bird ? 0.34 : 0.62) * s
  const standH = legLen + bodyH * 0.5

  /* ── torso ───────────────────────────────────────────────────── */
  bodyBin.add(def.fluffy ? G.sphere : G.capsule, bodyMat, {
    pos: [0, standH, 0],
    scale: def.fluffy
      ? [bodyW * 1.5, bodyH * 1.45, bodyLen * 1.05]
      : [bodyW, bodyLen * 0.62, bodyW],
    rot: def.fluffy ? [0, 0, 0] : [Math.PI / 2, 0, 0],
  })

  // Woolly sheep get a few extra lumps so the silhouette reads as fleece.
  if (def.fluffy) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      bodyBin.add(G.sphere, bodyMat, {
        pos: [Math.cos(a) * bodyW * 0.52, standH + Math.sin(a * 2) * 0.14 * s, Math.sin(a) * bodyLen * 0.4],
        scale: [0.52 * s, 0.5 * s, 0.52 * s],
      })
    }
  }

  /* ── spots ───────────────────────────────────────────────────── */
  for (let i = 0; i < (def.spots || 0); i++) {
    const a = (rng ? rng.range(0, Math.PI * 2) : Math.random() * 6.28)
    const t = (rng ? rng.range(-0.42, 0.42) : Math.random() - 0.5)
    const r = bodyW * 0.5
    bodyBin.add(G.sphere, patchMat, {
      pos: [Math.cos(a) * r * 0.98, standH + Math.sin(a) * bodyH * 0.44, t * bodyLen],
      scale: [0.36 * s, 0.3 * s, 0.42 * s],
    })
  }

  /* ── head (its own group so it can turn and bob) ─────────────── */
  const head = new THREE.Group()
  head.position.set(0, standH + bodyH * (def.bird ? 0.52 : 0.3), bodyLen * (def.bird ? 0.3 : 0.52))
  root.add(head)

  const headSize = (def.bird ? 0.34 : 0.56) * s
  headBin.add(G.box, bodyMat, {
    pos: [0, headSize * 0.2, 0],
    scale: [headSize, headSize * 0.92, headSize * 1.05],
  })

  // Muzzle / beak
  if (def.bird) {
    headBin.add(G.cone, snoutMat, {
      pos: [0, headSize * 0.16, headSize * 0.62],
      scale: [headSize * 0.42, headSize * 0.6, headSize * 0.42],
      rot: [Math.PI / 2, 0, 0],
    })
    headBin.add(G.box, def.horn, { // comb
      pos: [0, headSize * 0.78, 0], scale: [headSize * 0.14, headSize * 0.34, headSize * 0.62],
    })
  } else {
    headBin.add(G.box, snoutMat, {
      pos: [0, headSize * 0.02, headSize * 0.6],
      scale: [headSize * 0.78, headSize * 0.56, headSize * 0.42],
    })
    // nostrils
    for (const sx of [-1, 1]) {
      headBin.add(G.sphere, 0x000000, {
        pos: [sx * headSize * 0.17, headSize * 0.02, headSize * 0.79],
        scale: [headSize * 0.13, headSize * 0.16, headSize * 0.06],
      })
    }
  }

  // Eyes — oversized and forward-facing. Reads as friendly, not livestock.
  for (const sx of [-1, 1]) {
    headBin.add(G.sphere, eyeWhite, {
      pos: [sx * headSize * 0.3, headSize * 0.42, headSize * 0.42],
      scale: [headSize * 0.3, headSize * 0.34, headSize * 0.24],
    })
    headBin.add(G.sphere, eyeBlack, {
      pos: [sx * headSize * 0.32, headSize * 0.43, headSize * 0.52],
      scale: [headSize * 0.16, headSize * 0.2, headSize * 0.14],
    })
  }

  // Ears
  if (!def.bird) {
    for (const sx of [-1, 1]) {
      const floppy = def.ears === 'floppy'
      headBin.add(G.box, floppy ? snoutMat : bodyMat, {
        pos: [sx * headSize * 0.56, headSize * (floppy ? 0.44 : 0.5), floppy ? headSize * 0.2 : 0],
        scale: [headSize * 0.34, headSize * (floppy ? 0.42 : 0.2), headSize * 0.16],
        rot: [0, 0, sx * (floppy ? -0.7 : -0.35)],
      })
    }
  }

  // Horns
  if (def.hasHorns && hornMat) {
    for (const sx of [-1, 1]) {
      headBin.add(G.cone, hornMat, {
        pos: [sx * headSize * 0.4, headSize * 0.72, -headSize * 0.05],
        scale: [headSize * 0.2, headSize * 0.5, headSize * 0.2],
        rot: [0, 0, sx * 0.6],
      })
    }
  }

  /* ── legs (grouped, pivoting from the hip) ───────────────────── */
  const legs = []
  const legPairs = def.bird
    ? [[-0.18, 0], [0.18, 0]]
    : [[-1, 1], [1, 1], [-1, -1], [1, -1]]

  for (const p of legPairs) {
    const [lx, lz] = def.bird
      ? [p[0] * s, 0]
      : [p[0] * bodyW * 0.36, p[1] * bodyLen * 0.34]
    const hip = new THREE.Group()
    const legBin = new PartBin()
    hip.position.set(lx, standH - bodyH * 0.34, lz)
    legBin.add(G.box, legMat, {
      pos: [0, -legLen / 2, 0],
      scale: [(def.bird ? 0.1 : 0.2) * s, legLen, (def.bird ? 0.1 : 0.2) * s],
    })
    if (!def.bird) {
      legBin.add(G.box, 0x2e2b33, { // hoof
        pos: [0, -legLen + 0.05 * s, 0], scale: [0.23 * s, 0.14 * s, 0.23 * s],
      })
    }
    legBin.flush(hip)
    root.add(hip)
    legs.push(hip)
  }

  /* ── tail ────────────────────────────────────────────────────── */
  const tail = new THREE.Group()
  tail.position.set(0, standH + bodyH * 0.18, -bodyLen * 0.52)
  root.add(tail)
  if (def.tail === 'curly') {
    tailBin.add(G.cyl, snoutMat, { pos: [0, 0, -0.1 * s], scale: [0.1 * s, 0.3 * s, 0.1 * s], rot: [1.1, 0, 0.6] })
  } else if (def.bird) {
    tailBin.add(G.box, bodyMat, { pos: [0, 0.1 * s, -0.16 * s], scale: [0.3 * s, 0.3 * s, 0.14 * s], rot: [0.5, 0, 0] })
  } else {
    tailBin.add(G.box, bodyMat, { pos: [0, -0.22 * s, 0], scale: [0.09 * s, 0.55 * s, 0.09 * s] })
    tailBin.add(G.sphere, patchMat, { pos: [0, -0.52 * s, 0], scale: [0.19 * s, 0.24 * s, 0.19 * s] })
  }

  /* ── udder ───────────────────────────────────────────────────── */
  if (def.hasUdder) {
    bodyBin.add(G.sphere, snoutMat, {
      pos: [0, standH - bodyH * 0.44, -bodyLen * 0.06],
      scale: [0.4 * s, 0.32 * s, 0.4 * s],
    })
  }

  bodyBin.flush(root)
  headBin.flush(head)
  tailBin.flush(tail)

  root.userData.standHeight = standH
  root.userData.radius = Math.max(bodyW, bodyLen * 0.5) * 0.6

  return { root, legs, head, tail, def, scale: s }
}

/**
 * Per-frame animation. Kept as a free function so the entity layer owns
 * state and this stays a pure "pose from numbers" routine.
 */
export function animateCritter(c, { t, speed = 0, panic = 0, lifted = 0, stun = 0 }) {
  if (stun > 0) {
    // Zapped: sits down, wobbles, legs stick out. Reads as dazed, not hurt.
    c.root.rotation.z = Math.sin(t * 11) * 0.22 * stun
    c.head.rotation.z = Math.sin(t * 14) * 0.5 * stun
    c.head.rotation.x = 0.3 * stun
    for (let i = 0; i < c.legs.length; i++) {
      c.legs[i].rotation.x = (i < 2 ? 1 : -1) * 0.9 * stun
    }
    c.tail.rotation.z = Math.sin(t * 20) * 0.6 * stun
    return
  }
  const gait = c.def.bird ? 14 : 9
  const swing = Math.min(1, speed / 2) * (c.def.bird ? 0.9 : 0.7)

  for (let i = 0; i < c.legs.length; i++) {
    const phase = i % 2 === 0 ? 0 : Math.PI
    const diag = i < 2 ? 0 : Math.PI
    c.legs[i].rotation.x = Math.sin(t * gait + phase + diag) * swing
  }

  // Idle head bob turns into frantic shaking when panicking.
  const bob = Math.sin(t * 2.2) * 0.05
  c.head.rotation.x = bob + panic * Math.sin(t * 22) * 0.22 - swing * 0.12
  c.head.rotation.z = panic * Math.sin(t * 17) * 0.3

  // Tail flicks constantly; faster when scared.
  c.tail.rotation.z = Math.sin(t * (3 + panic * 9)) * (0.25 + panic * 0.5)
  c.tail.rotation.x = Math.sin(t * 2.4) * 0.15

  // Once caught in the beam they tumble helplessly.
  if (lifted > 0) {
    c.root.rotation.y += 0.09 * lifted
    c.root.rotation.z = Math.sin(t * 6) * 0.5 * lifted
    c.root.rotation.x = Math.sin(t * 4.6) * 0.4 * lifted
    for (const l of c.legs) l.rotation.x = Math.sin(t * 19 + l.position.x * 9) * 1.1 * lifted
  }
}
