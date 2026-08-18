import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { assets, fitToHeight } from '../core/assets.js'
import { makeCritter, animateCritter, SPECIES } from '../world/critters.js'

export const STATE = {
  IDLE: 0, WANDER: 1, FLEE: 2, LIFTED: 3, DONE: 4,
}

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
  }

  get pos() { return this.root.position }

  /** Pick somewhere new to amble to. */
  _repick(rng) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * this.homeRange
    this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r)
    this.think = 2 + Math.random() * 4
  }

  update(dt, ctx) {
    const { world, ufo, t, audio } = ctx
    if (this.state === STATE.DONE) return

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
      this.groundY = world.heightAt(p.x, p.z)
      if (p.y > this.groundY + 0.02) {
        this.velY -= 26 * dt
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
  dispose() { this.root.parent?.remove(this.root) }
}

/* ══ farm animals ══════════════════════════════════════════════════ */
export class CritterEntity extends Abductable {
  constructor(kind, x, z, rng) {
    const built = makeCritter(kind, rng)
    const def = SPECIES[kind]
    super(built.root, {
      label: def.label, icon: def.icon, points: def.points,
      speed: def.speed, x, z, radius: built.root.userData.radius,
      mass: def.size * 1.1, sfx: def.moo, homeRange: 24,
    })
    this.built = built
    this.root.position.set(x, 0, z)
  }

  animate(dt, t) {
    animateCritter(this.built, {
      t: t + this.id * 0.37,
      speed: this.moveSpeed ?? 0,
      panic: this.panic,
      lifted: this.lift,
    })
  }
}

/* ══ people ════════════════════════════════════════════════════════ */
const HUMAN_KINDS = {
  farmer: { src: 'Barbarian', label: 'Farmer', icon: '🧑‍🌾', points: 150, tint: null },
  vet: { src: 'Mage', label: 'Vet', icon: '🧑‍⚕️', points: 200, tint: 0xf2f6f7 },
  doctor: { src: 'Knight', label: 'Doctor', icon: '👨‍⚕️', points: 220, tint: 0xf6fbfc },
  nurse: { src: 'Mage', label: 'Nurse', icon: '👩‍⚕️', points: 180, tint: 0xeaf6ff },
  patient: { src: 'Rogue', label: 'Patient', icon: '🤒', points: 160, tint: 0xbfe7d8 },
  pirate: { src: 'Rogue_Hooded', label: 'Pirate', icon: '🏴‍☠️', points: 240, tint: 0x6b5a48 },
  captain: { src: 'Knight', label: 'Pirate Captain', icon: '🦜', points: 400, tint: 0x7a2b2b },
  rambler: { src: 'Ranger', label: 'Rambler', icon: '🥾', points: 170, tint: null },
}

export class HumanEntity extends Abductable {
  static clips = null

  static async preload() {
    const kinds = [...new Set(Object.values(HUMAN_KINDS).map((k) => k.src))]
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
    // Tint the whole outfit — the packs have no medical or pirate skins, so
    // colour is what separates a doctor from a deckhand.
    if (spec.tint) {
      model.traverse((o) => {
        if (!o.isMesh) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        o.material = mats.map((m) => {
          const nm = m.clone()
          nm.color = new THREE.Color(spec.tint)
          return nm
        })
        if (!Array.isArray(o.material)) o.material = o.material[0]
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
      ['run', 'Running_A'], ['panic', 'Running_B'], ['lift', 'Spawn_Air']]) {
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

  static _sources = new Map()
  static async buildSources() {
    for (const k of new Set(Object.values(HUMAN_KINDS).map((x) => x.src))) {
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
        this.velY -= 30 * dt
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
