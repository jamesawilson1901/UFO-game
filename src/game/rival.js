import * as THREE from 'three'
import { assets, fitToWidth } from '../core/assets.js'

/**
 * The rival saucer.
 *
 * A whole little story loop, which is the point — it gives a five-year-old
 * something with intent to react to:
 *   ARRIVE  → swoops in from off-map, taunting
 *   CHARGE  → lines up and rams you; you drop your cargo
 *   STEAL   → beams up the cows you just dropped
 *   FLEE    → runs for the edge once it has a full hold
 *   HURT    → shot enough times, it spirals off trailing smoke
 *
 * It cannot actually hurt the player beyond knocking cargo loose — there is
 * no losing in this game, only the indignity of a green alien stealing your
 * cows in front of you.
 */

export const RIVAL_STATE = {
  ARRIVE: 'arrive', CHARGE: 'charge', STEAL: 'steal', FLEE: 'flee', DEAD: 'dead',
}

const TAUNTS = [
  'MY COWS NOW!', 'HA HA HA!', 'TOO SLOW!', 'MINE! ALL MINE!',
  'NICE TRY, EARTHLING!', 'BEEP BOOP, THANKS!',
]
const HIT_CRIES = ['OW!', 'HEY!', 'OOF!', 'NOT FAIR!', 'MY PAINT!']

export class Rival {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.pos = new THREE.Vector3()
    this.vel = new THREE.Vector3()
    this.state = RIVAL_STATE.ARRIVE
    this.hp = 6
    this.maxHp = 6
    this.alive = false
    this.stolen = 0
    this.hitFlash = 0
    this.rammedAt = -99
  }

  async load() {
    const src = await assets.glb('assets/ufo/rival.glb')
    this.hull = new THREE.Group()

    // Built from primitives: a green, meaner-looking saucer that reads as
    // "the other one" instantly, without needing a second UFO model.
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6ee06e, metalness: 0.25, roughness: 0.45, flatShading: true }))
    body.scale.y = 0.3
    const under = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2f7a3f, metalness: 0.2, roughness: 0.6, flatShading: true }))
    under.scale.y = 0.22
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.75, flatShading: true }))
    dome.position.y = 0.9
    // Angry eyebrow-ish fins.
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 3.4, 5),
        new THREE.MeshStandardMaterial({ color: 0x2f7a3f, flatShading: true }))
      fin.position.set(sx * 4.6, 0.4, 0)
      fin.rotation.z = sx * -1.15
      this.hull.add(fin)
    }
    this.hull.add(body, under, dome)
    this.group.add(this.hull)

    this.lights = []
    const bulb = new THREE.SphereGeometry(0.4, 8, 6)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const m = new THREE.MeshBasicMaterial({ color: 0xff3b3b })
      const b = new THREE.Mesh(bulb, m)
      b.position.set(Math.cos(a) * 4.4, -0.5, Math.sin(a) * 4.4)
      this.hull.add(b)
      this.lights.push(m)
    }

    // Its own (uglier) beam.
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 1, 1, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x8dff6a, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }))
    this.beam.visible = false
    this.group.add(this.beam)

    this.group.visible = false
    this.scene.add(this.group)
    return this
  }

  /** Bring it in from a random map edge. */
  spawn(world, ufoPos, rng) {
    const a = rng.range(0, Math.PI * 2)
    const r = world.half - 10
    this.pos.set(Math.cos(a) * r, 40, Math.sin(a) * r)
    this.vel.set(0, 0, 0)
    this.state = RIVAL_STATE.ARRIVE
    this.hp = this.maxHp
    this.alive = true
    this.stolen = 0
    this.group.visible = true
    this.beam.visible = false
    this.spawnedAt = performance.now() / 1000
    return TAUNTS[Math.floor(rng() * TAUNTS.length)]
  }

  hit(damage = 1) {
    // Already spiralling: further hits are cosmetic, not another kill.
    if (!this.alive || this.state === RIVAL_STATE.DEAD) return null
    this.hp -= damage
    this.hitFlash = 1
    if (this.hp <= 0) {
      this.state = RIVAL_STATE.DEAD
      this.deadAt = 0
      return 'down'
    }
    return HIT_CRIES[Math.floor(Math.random() * HIT_CRIES.length)]
  }

  /**
   * @param {object} ctx  { ufo, world, dt, t, loot } where `loot` are the
   *                      dropped items it will try to steal.
   */
  update(dt, ctx) {
    if (!this.alive) return null
    const { ufo, world, t, loot } = ctx
    let event = null

    const ground = world.heightAt(this.pos.x, this.pos.z)
    const steer = (tx, ty, tz, accel, cap) => {
      const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z
      const d = Math.hypot(dx, dy, dz) || 1
      this.vel.x += (dx / d) * accel * dt
      this.vel.y += (dy / d) * accel * dt
      this.vel.z += (dz / d) * accel * dt
      const sp = this.vel.length()
      if (sp > cap) this.vel.multiplyScalar(cap / sp)
    }

    switch (this.state) {
      case RIVAL_STATE.DEAD: {
        // Spiral away trailing smoke, then vanish.
        this.deadAt += dt
        this.vel.y -= 16 * dt
        this.vel.x *= 0.99
        this.vel.z *= 0.99
        this.hull.rotation.z += dt * 7
        this.hull.rotation.x += dt * 4
        this.pos.addScaledVector(this.vel, dt)
        if (this.pos.y < ground + 1 || this.deadAt > 3.2) {
          this.alive = false
          this.group.visible = false
          event = { type: 'crashed', at: this.pos.clone() }
        }
        break
      }

      case RIVAL_STATE.ARRIVE: {
        steer(ufo.pos.x, ufo.pos.y + 14, ufo.pos.z, 46, 34)
        this.pos.addScaledVector(this.vel, dt)
        if (this.pos.distanceTo(ufo.pos) < 60) this.state = RIVAL_STATE.CHARGE
        break
      }

      case RIVAL_STATE.CHARGE: {
        steer(ufo.pos.x, ufo.pos.y, ufo.pos.z, 74, 52)
        this.pos.addScaledVector(this.vel, dt)
        if (this.pos.distanceTo(ufo.pos) < 9 && t - this.rammedAt > 2.5) {
          this.rammedAt = t
          // Bounce off, then start hoovering up whatever fell out.
          const away = this.pos.clone().sub(ufo.pos).normalize()
          this.vel.copy(away).multiplyScalar(46)
          this.state = RIVAL_STATE.STEAL
          event = { type: 'rammed', dir: away }
        }
        break
      }

      case RIVAL_STATE.STEAL: {
        const target = this._nearestLoot(loot)
        if (target) {
          const tg = world.heightAt(target.root.position.x, target.root.position.z)
          steer(target.root.position.x, tg + 20, target.root.position.z, 52, 32)
          this.pos.addScaledVector(this.vel, dt)
          const d = Math.hypot(this.pos.x - target.root.position.x, this.pos.z - target.root.position.z)
          this.beam.visible = d < 26
          if (d < 9) {
            target.stolenProgress = (target.stolenProgress ?? 0) + dt
            target.root.position.y += 9 * dt
            target.root.rotation.y += dt * 5
            if (target.stolenProgress > 1.1) {
              event = { type: 'stole', entity: target }
              this.stolen++
              if (this.stolen >= 3) this.state = RIVAL_STATE.FLEE
            }
          }
        } else {
          this.state = RIVAL_STATE.CHARGE
          this.beam.visible = false
        }
        break
      }

      case RIVAL_STATE.FLEE: {
        const a = Math.atan2(this.pos.z, this.pos.x)
        steer(Math.cos(a) * (world.half + 40), 60, Math.sin(a) * (world.half + 40), 60, 56)
        this.pos.addScaledVector(this.vel, dt)
        this.beam.visible = false
        if (Math.abs(this.pos.x) > world.half + 20 || Math.abs(this.pos.z) > world.half + 20) {
          this.alive = false
          this.group.visible = false
          event = { type: 'escaped' }
        }
        break
      }
    }

    // Keep it above the terrain unless it is crashing.
    if (this.state !== RIVAL_STATE.DEAD) {
      const minY = ground + 13
      if (this.pos.y < minY) { this.pos.y = minY; this.vel.y = Math.max(0, this.vel.y) }
    }

    this.group.position.copy(this.pos)
    if (this.state !== RIVAL_STATE.DEAD) {
      this.hull.rotation.y += dt * 2.4
      this.hull.rotation.z = THREE.MathUtils.clamp(-this.vel.x / 60, -0.5, 0.5)
      this.hull.rotation.x = THREE.MathUtils.clamp(this.vel.z / 60, -0.5, 0.5)
    }

    // Damage flash and a wobblier ride as it takes hits.
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3)
    const hurt = 1 - this.hp / this.maxHp
    const lit = this.hitFlash > 0.4
    for (let i = 0; i < this.lights.length; i++) {
      const phase = (t * 4 + i / this.lights.length) % 1
      this.lights[i].color.setHex(lit ? 0xffffff : (phase < 0.35 ? 0xff3b3b : 0x5a1010))
    }
    this.hull.position.y = Math.sin(t * (9 + hurt * 22)) * hurt * 0.7

    if (this.beam.visible) {
      const drop = this.pos.y - ground
      this.beam.scale.set(7, drop, 7)
      this.beam.position.y = -drop / 2
    }

    return event
  }

  _nearestLoot(loot) {
    let best = null, bestD = 1e9
    for (const e of loot) {
      if (!e || e.state === 4) continue
      const d = Math.hypot(e.root.position.x - this.pos.x, e.root.position.z - this.pos.z)
      if (d < bestD) { bestD = d; best = e }
    }
    return bestD < 260 ? best : null
  }
}
