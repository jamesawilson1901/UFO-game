import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { assets, fitToHeight } from '../core/assets.js'
import { makeCritter, animateCritter, SPECIES } from '../world/critters.js'

export const STATE = {
  IDLE: 0, WANDER: 1, FLEE: 2, LIFTED: 3, DONE: 4,
}

/** Scaled by the low-gravity event so everything floats comically. */
export const PHYSICS = { gravity: 1 }

let _id = 0

/**
 * Anything the beam can pick up. Subclasses supply a visual and an
 * `animate()`; the shared code owns movement, panic and the lift.
 */
export class Abductable {
  constructor(root, opts) {
    this.id = ++_id
    this.root = root
    this.label = opts.label
    this.icon = opts.icon
    this.points = opts.points
    this.speed = opts.speed ?? 2
    this.radius = opts.radius ?? 1
    this.mass = opts.mass ?? 1
    this.home = new THREE.Vector2(opts.x, opts.z)
    this.homeRange = opts.homeRange ?? 26
    this.state = STATE.WANDER
    this.lift = 0
    this.panic = 0
    this.heading = Math.random() * Math.PI * 2
    this.target = new THREE.Vector2(opts.x, opts.z)
    this.think = Math.random() * 2
    this.groundY = 0
    this.velY = 0
    this.sfx = opts.sfx
    this.chatter = 2 + Math.random() * 8
    this.stun = 0
  }

  get pos() { return this.root.position }

  /** Pick somewhere new to amble to. */
  _repick(rng) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * this.homeRange
    this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r)
    this.think = 2 + Math.random() * 4
  }

  /** Zapped: sits down dizzy for a few seconds and stops running away. */
  zap(seconds = 3.5) {
    this.stun = Math.max(this.stun, seconds)
    this.panic = 0
    return true
  }

  update(dt, ctx) {
    const { world, ufo, t, audio } = ctx
    if (this.state === STATE.DONE) return
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt)

    const p = this.root.position
    const dx = ufo.pos.x - p.x
    const dz = ufo.pos.z - p.z
    const distXZ = Math.hypot(dx, dz)

    /* ── in the beam? ───────────────────────────────────────────── */
    const fp = ufo.beamFootprint(this.groundY)
    const caught = ufo.beamPower > 0.35 && distXZ < fp.radius * 0.95
    if (caught && this.state !== STATE.LIFTED) {
      this.state = STATE.LIFTED
      this.liftStart = t
      if (this.sfx) audio.play(this.sfx, { volume: 0.6, throttle: 0.06, rate: 1.15 })
    } else if (!caught && this.state === STATE.LIFTED) {
      // Dropped out of the beam — falls back down.
      this.state = STATE.FLEE
      this.panic = 1
    }

    switch (this.state) {
      case STATE.LIFTED: {
        this.lift = Math.min(1, this.lift + dt * 2.4)
        // Rise faster the longer it's held; heavier things climb slower.
        const pull = (8.5 + (t - this.liftStart) * 9) / this.mass
        p.y += pull * dt
        // Drift toward the beam axis so it funnels neatly into the saucer.
        p.x += dx * Math.min(1, dt * 3.4)
        p.z += dz * Math.min(1, dt * 3.4)
        this.panic = 1
        if (p.y > ufo.pos.y - 2.2) {
          this.state = STATE.DONE
          this.collected = true
        }
        break
      }

      case STATE.FLEE: {
        if (this.stun > 0) { this.moveSpeed = 0; break }
        this.panic = Math.max(0, this.panic - dt * 0.35)
        // Run directly away from the saucer's ground point.
        const len = Math.max(0.001, distXZ)
        const away = new THREE.Vector2(-dx / len, -dz / len)
        // Curve back toward home so nobody sprints off the map.
        const hx = this.home.x - p.x, hz = this.home.y - p.z
        const hlen = Math.hypot(hx, hz)
        if (hlen > this.homeRange * 1.8) {
          away.x += (hx / hlen) * 1.4
          away.y += (hz / hlen) * 1.4
          away.normalize()
        }
        const sp = this.speed * (1.7 + this.panic * 0.9)
        p.x += away.x * sp * dt
        p.z += away.y * sp * dt
        this.heading = Math.atan2(away.x, away.y)
        this.moveSpeed = sp
        if (distXZ > fp.radius * 3.4 && this.panic < 0.05) {
          this.state = STATE.WANDER
          this._repick()
        }
        break
      }

      default: {
        if (this.stun > 0) { this.moveSpeed = 0; break }
        // Spook when the saucer looms overhead, beam or not.
        if (distXZ < fp.radius * 2.1 && ufo.pos.y - this.groundY < 34) {
          this.state = STATE.FLEE
          this.panic = 1
          if (this.sfx && Math.random() < 0.4) {
            audio.play(this.sfx, { volume: 0.4, throttle: 0.25 })
          }
          break
        }
        this.think -= dt
        if (this.think <= 0) this._repick()
        const tx = this.target.x - p.x
        const tz = this.target.y - p.z
        const d = Math.hypot(tx, tz)
        if (d > 1.2) {
          const sp = this.speed
          p.x += (tx / d) * sp * dt
          p.z += (tz / d) * sp * dt
          this.heading = Math.atan2(tx, tz)
          this.moveSpeed = sp
        } else {
          this.moveSpeed = 0
          this.think = Math.min(this.think, 0)
        }
        // Occasional idle noise keeps the farm alive.
        this.chatter -= dt
        if (this.chatter <= 0) {
          this.chatter = 8 + Math.random() * 22
          if (this.sfx && distXZ < 90) {
            audio.play(this.sfx, { volume: 0.18, throttle: 1.4, rate: 0.95 })
          }
        }
        break
      }
    }

    /* ── settle on the ground unless being lifted ───────────────── */
    if (this.state !== STATE.LIFTED) {
      if (this.stun <= 0) this.root.rotation.z *= 1 - Math.min(1, dt * 6)
      this.groundY = world.heightAt(p.x, p.z)
      if (p.y > this.groundY + 0.02) {
        this.velY -= 26 * PHYSICS.gravity * dt
        p.y += this.velY * dt
        if (p.y <= this.groundY) { p.y = this.groundY; this.velY = 0; this.lift = 0 }
      } else {
        p.y = this.groundY
        this.velY = 0
        this.lift = Math.max(0, this.lift - dt * 3)
      }
      const turn = this.heading - this.root.rotation.y
      this.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 7)
      this.root.rotation.x *= 1 - Math.min(1, dt * 6)
      this.root.rotation.z *= 1 - Math.min(1, dt * 6)
    }

    this.animate(dt, t)
  }

  animate() {}

  /**
   * Every skinned clone carries its own Skeleton, and a Skeleton allocates a
   * bone texture on the GPU. Nothing else frees them, so with NPCs respawning
   * all round they accumulate steadily — a few hundred per world.
   */
  dispose() {
    this.root.traverse?.((o) => {
      if (o.isSkinnedMesh && o.skeleton) {
        o.skeleton.boneTexture?.dispose()
        o.skeleton.boneTexture = null
      }
    })
    this.root.parent?.remove(this.root)
  }
}

/* ══ farm animals ══════════════════════════════════════════════════ */
export class CritterEntity extends Abductable {
  constructor(kind, x, z, rng, { golden = false } = {}) {
    const built = makeCritter(kind, rng)
    const def = SPECIES[kind]
    super(built.root, {
      label: golden ? `Golden ${def.label}` : def.label,
      icon: golden ? '🌟' : def.icon,
      points: golden ? def.points * 8 : def.points,
      speed: def.speed * (golden ? 1.5 : 1), x, z,
      radius: built.root.userData.radius,
      mass: def.size * 1.1, sfx: def.moo, homeRange: golden ? 40 : 24,
    })
    this.built = built
    this.golden = golden
    if (golden) {
      // Worth eight of its ordinary cousins, runs faster, and unmistakable
      // from the air. One shared material so the whole animal is a single
      // draw call rather than thirty.
      const gold = CritterEntity._goldMat()
      built.root.traverse((o) => { if (o.isMesh) o.material = gold })
      built.root.scale.setScalar(1.15)
    }
    this.root.position.set(x, 0, z)
  }

  static _gold = null
  static _goldMat() {
    if (!CritterEntity._gold) {
      // vertexColors stays off so the gold overrides the baked cow colours.
      CritterEntity._gold = new THREE.MeshStandardMaterial({
        color: 0xffd23f, emissive: 0x6b4a00, emissiveIntensity: 0.55,
        metalness: 0.35, roughness: 0.3, flatShading: true, vertexColors: false,
      })
      CritterEntity._gold.userData.shared = true
    }
    return CritterEntity._gold
  }

  animate(dt, t) {
    animateCritter(this.built, {
      t: t + this.id * 0.37,
      speed: this.moveSpeed ?? 0,
      panic: this.panic,
      lifted: this.lift,
      stun: Math.min(1, this.stun),
    })
  }
}

/* ══ people ════════════════════════════════════════════════════════ */
/*
 * One cast list across every world. The packs only contain fantasy
 * adventurers and skeletons, so a role is a base model plus (optionally) a
 * flat uniform colour. Tinting a textured material only ever darkens it
 * toward black, so uniforms REPLACE the material instead.
 */
const HUMAN_KINDS = {
  // farm
  farmer: { src: 'Barbarian', label: 'Farmer', icon: '🧑‍🌾', points: 150 },
  rambler: { src: 'Ranger', label: 'Rambler', icon: '🥾', points: 170 },
  vet: { src: 'Mage', label: 'Vet', icon: '🧑‍⚕️', points: 200, uniform: 0x8fd4e8 },
  // pirate
  pirate: { src: 'Rogue_Hooded', label: 'Pirate', icon: '🏴‍☠️', points: 240 },
  captain: { src: 'Knight', label: 'Pirate Captain', icon: '🦜', points: 400 },
  // hospital
  doctor: { src: 'Knight', label: 'Doctor', icon: '👨‍⚕️', points: 220, uniform: 0xf7fbfc },
  nurse: { src: 'Mage', label: 'Nurse', icon: '👩‍⚕️', points: 180, uniform: 0xe4f2fb },
  patient: { src: 'Rogue', label: 'Patient', icon: '🤒', points: 160, uniform: 0xa8dcc4 },
  // spooky
  skeleton: { src: 'Skeleton_Warrior', label: 'Skeleton', icon: '💀', points: 210 },
  skelemage: { src: 'Skeleton_Mage', label: 'Bone Wizard', icon: '🧙', points: 320 },
  ghoul: { src: 'Skeleton_Rogue', label: 'Ghoul', icon: '👻', points: 260 },
  // snow
  elf: { src: 'Rogue', label: 'Elf', icon: '🧝', points: 190, uniform: 0x3fae5a },
  santa: { src: 'Barbarian', label: 'Santa', icon: '🎅', points: 500, uniform: 0xd8342f },
  // castle
  knight: { src: 'Knight', label: 'Knight', icon: '⚔️', points: 230 },
  archer: { src: 'Ranger', label: 'Archer', icon: '🏹', points: 210 },
  wizard: { src: 'Mage', label: 'Wizard', icon: '🧙‍♂️', points: 340, uniform: 0x7a5bd0 },
  // jungle
  explorer: { src: 'Ranger', label: 'Explorer', icon: '🧭', points: 200, uniform: 0xd8c48a },
  // moon
  astronaut: { src: 'Knight', label: 'Astronaut', icon: '👨‍🚀', points: 300, uniform: 0xf2f4f7 },
  spaceman: { src: 'Mage', label: 'Space Cadet', icon: '🚀', points: 280, uniform: 0xc8cdd6 },
}

export class HumanEntity extends Abductable {
  static clips = null

  static async preload(kindNames = null) {
    const wanted = kindNames ? kindNames.map((n) => HUMAN_KINDS[n]).filter(Boolean)
      : Object.values(HUMAN_KINDS)
    const kinds = [...new Set(wanted.map((k) => k.src))]
    await Promise.all(kinds.map((k) => assets.glb(`assets/chars/${k}.glb`)))
    const [move, gen] = await Promise.all([
      assets.glb('assets/chars/Rig_Medium_MovementBasic.glb'),
      assets.glb('assets/chars/Rig_Medium_General.glb'),
    ])
    const byName = new Map()
    for (const g of [move, gen]) {
      for (const c of g?.animations ?? []) byName.set(c.name, c)
    }
    HumanEntity.clips = byName
  }

  constructor(kind, x, z, rng) {
    const spec = HUMAN_KINDS[kind]
    const g = HumanEntity._sources.get(spec.src)
    const model = skeletonClone(g)
    fitToHeight(model, 1.85)   // an actual person, not a giant
    if (spec.uniform) {
      // Replace, don't tint: the source material carries a texture, and
      // multiplying a colour through it only ever darkens. One shared
      // material per uniform colour keeps this to a single draw call.
      const flat = HumanEntity._uniformMat(spec.uniform)
      model.traverse((o) => {
        if (!o.isMesh) return
        o.material = Array.isArray(o.material) ? o.material.map(() => flat) : flat
      })
    }
    const root = new THREE.Group()
    root.add(model)
    super(root, {
      label: spec.label, icon: spec.icon, points: spec.points,
      speed: 3.1 + Math.random() * 0.8, x, z, radius: 1.1, mass: 1.15,
      homeRange: 30,
    })
    this.kind = kind
    this.model = model
    this.mixer = new THREE.AnimationMixer(model)
    this.actions = {}
    for (const [name, key] of [['idle', 'Idle_A'], ['walk', 'Walking_A'],
      ['run', 'Running_A'], ['panic', 'Running_B'], ['lift', 'Spawn_Air'],
      ['stunned', 'Hit_A']]) {
      const clip = HumanEntity.clips?.get(key)
      if (clip) {
        const act = this.mixer.clipAction(clip)
        act.enabled = true
        this.actions[name] = act
      }
    }
    this.current = null
    this._play('idle')
    this.root.position.set(x, 0, z)
  }

  static _uniforms = new Map()
  static _uniformMat(hex) {
    let m = HumanEntity._uniforms.get(hex)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.8, metalness: 0 })
      m.userData.shared = true          // reused by every later round
      HumanEntity._uniforms.set(hex, m)
    }
    return m
  }

  static _sources = new Map()
  static async buildSources(kindNames = null) {
    const wanted = kindNames ? kindNames.map((n) => HUMAN_KINDS[n]).filter(Boolean)
      : Object.values(HUMAN_KINDS)
    for (const k of new Set(wanted.map((x) => x.src))) {
      const g = await assets.glb(`assets/chars/${k}.glb`)
      if (g) HumanEntity._sources.set(k, g.scene)
    }
  }

  _play(name, fade = 0.22) {
    const act = this.actions[name]
    if (!act || this.current === act) return
    act.reset().setEffectiveWeight(1).fadeIn(fade).play()
    if (this.current) this.current.fadeOut(fade)
    this.current = act
  }

  animate(dt) {
    if (this.state === STATE.LIFTED) this._play('lift', 0.15)
    else if (this.stun > 0) {
      this._play('stunned', 0.15)
      this.model.rotation.z = Math.sin(performance.now() / 90) * 0.2
    }
    else if (this.panic > 0.15) this._play('panic', 0.15)
    else if ((this.moveSpeed ?? 0) > 0.2) this._play('walk')
    else this._play('idle')
    this.mixer.update(dt)
  }
}

export const HUMANS = HUMAN_KINDS

/* ══ inanimate loot ════════════════════════════════════════════════ */
export class PropEntity extends Abductable {
  constructor(model, x, z, opts) {
    const root = new THREE.Group()
    root.add(model)
    super(root, { ...opts, x, z, speed: 0 })
    this.state = STATE.IDLE
    this.spin = (Math.random() - 0.5) * 2
    this.root.position.set(x, 0, z)
    this.root.rotation.y = Math.random() * Math.PI * 2
  }

  update(dt, ctx) {
    // Props never wander; they only react to the beam.
    if (this.state === STATE.DONE) return
    const { ufo, world, t } = ctx
    const p = this.root.position
    const dx = ufo.pos.x - p.x, dz = ufo.pos.z - p.z
    const dist = Math.hypot(dx, dz)
    const fp = ufo.beamFootprint(this.groundY)
    const caught = ufo.beamPower > 0.35 && dist < fp.radius * 0.95

    if (caught) {
      this.state = STATE.LIFTED
      this.lift = Math.min(1, this.lift + dt * 3)
      p.y += (9 / this.mass) * dt * (1 + this.lift * 3)
      p.x += dx * Math.min(1, dt * 3.4)
      p.z += dz * Math.min(1, dt * 3.4)
      this.root.rotation.y += dt * 6 * this.spin
      this.root.rotation.x += dt * 3.4
      if (p.y > ufo.pos.y - 2.2) { this.state = STATE.DONE; this.collected = true }
    } else {
      this.state = STATE.IDLE
      this.groundY = world.heightAt(p.x, p.z)
      if (p.y > this.groundY + 0.02) {
        this.velY -= 30 * PHYSICS.gravity * dt
        p.y += this.velY * dt
        this.root.rotation.x += dt * 4
        if (p.y <= this.groundY) {
          p.y = this.groundY; this.velY = 0; this.lift = 0
          this.root.rotation.x = 0; this.root.rotation.z = 0
        }
      } else {
        p.y = this.groundY
      }
    }
  }
}

/* ══ loot catalogue ════════════════════════════════════════════════
   Themes name their loot; this maps a name to a model and its stats.
   Sizes are deliberately oversized — a realistically-scaled donut is
   invisible from the saucer, and a cow-sized one is funnier anyway.   */
export const LOOT = {
  pizza: { path: 'assets/food/pizza.glb', label: 'Pizza', icon: '🍕', points: 70, size: 3.2 },
  burger: { path: 'assets/food/burger.glb', label: 'Burger', icon: '🍔', points: 60, size: 2.6 },
  cake: { path: 'assets/food/cake-birthday.glb', label: 'Birthday Cake', icon: '🎂', points: 130, size: 3.0 },
  donut: { path: 'assets/food/donut-sprinkles.glb', label: 'Donut', icon: '🍩', points: 50, size: 2.4 },
  icecream: { path: 'assets/food/ice-cream.glb', label: 'Ice Cream', icon: '🍦', points: 65, size: 2.2 },
  watermelon: { path: 'assets/food/watermelon.glb', label: 'Watermelon', icon: '🍉', points: 80, size: 2.4 },
  turkey: { path: 'assets/food/turkey.glb', label: 'Roast Turkey', icon: '🍗', points: 110, size: 2.6 },
  chest: { path: 'assets/pirate/chest.glb', label: 'Treasure Chest', icon: '💰', points: 300, size: 3.0 },
  barrel: { path: 'assets/pirate/barrel.glb', label: 'Barrel', icon: '🛢️', points: 45, size: 2.0 },
  cannonball: { path: 'assets/pirate/cannon-ball.glb', label: 'Cannonball', icon: '⚫', points: 35, size: 1.4 },
  bottle: { path: 'assets/pirate/bottle-large.glb', label: 'Grog Bottle', icon: '🍾', points: 55, size: 1.8 },
  haystack: { path: 'assets/nature/log_stack.glb', label: 'Hay Bales', icon: '🌾', points: 60, size: 3.0 },
  pumpkin: { path: 'assets/nature/crop_pumpkin.glb', label: 'Pumpkin', icon: '🎃', points: 75, size: 2.2 },
  portaloo: { path: 'assets/props/portapotty/scene.gltf', label: 'Portaloo', icon: '🚽', points: 240, size: 3.4 },
  skull: { path: 'assets/spooky/skull.glb', label: 'Skull', icon: '💀', points: 90, size: 2.0 },
  present: { path: 'assets/holiday/present-a-cube.glb', label: 'Present', icon: '🎁', points: 120, size: 2.4 },
  snowman: { path: 'assets/holiday/snowman.glb', label: 'Snowman', icon: '⛄', points: 160, size: 3.6 },
  fish: { path: 'assets/survival/fish-large.glb', label: 'Big Fish', icon: '🐟', points: 85, size: 2.4 },

  // spooky — the graveyard kit ships these as models, so they can be beamed
  ghost: { path: 'assets/graveyard/ghost.glb', label: 'Ghost', icon: '👻', points: 350, size: 3.0 },
  zombie: { path: 'assets/graveyard/zombie.glb', label: 'Zombie', icon: '🧟', points: 280, size: 3.0 },
  vampire: { path: 'assets/graveyard/vampire.glb', label: 'Vampire', icon: '🧛', points: 420, size: 3.0 },
  pumpkincarved: { path: 'assets/graveyard/pumpkinTallCarved.glb', label: 'Jack-o-Lantern', icon: '🎃', points: 140, size: 2.4 },
  coffin: { path: 'assets/graveyard/coffin.glb', label: 'Coffin', icon: '⚰️', points: 200, size: 3.4 },

  // moon
  spacebarrel: { path: 'assets/space/barrelLarge.obj', mtl: 'assets/space/barrelLarge.mtl', linear: false, label: 'Fuel Barrel', icon: '🛢️', points: 90, size: 2.4 },
  meteor: { path: 'assets/space/meteorHalf.obj', mtl: 'assets/space/meteorHalf.mtl', linear: false, label: 'Meteor', icon: '☄️', points: 160, size: 3.0 },

  // city — heavy, tumbling and hilarious to steal
  taxi: { path: 'assets/cars/taxi.glb', label: 'Taxi', icon: '🚕', points: 260, size: 4.4 },
  firetruck: { path: 'assets/cars/firetruck.glb', label: 'Fire Engine', icon: '🚒', points: 420, size: 5.2 },
  police: { path: 'assets/cars/police.glb', label: 'Police Car', icon: '🚓', points: 320, size: 4.4 },
  ambulancecar: { path: 'assets/cars/ambulance.glb', label: 'Ambulance', icon: '🚑', points: 380, size: 5.0 },
  van: { path: 'assets/cars/van.glb', label: 'Van', icon: '🚐', points: 240, size: 4.6 },
  garbagetruck: { path: 'assets/cars/garbageTruck.glb', label: 'Bin Lorry', icon: '🚛', points: 400, size: 5.4 },
}
