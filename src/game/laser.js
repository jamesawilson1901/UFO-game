import * as THREE from 'three'

/**
 * Lasers.
 *
 * Two deliberate design choices for the age group:
 *  - Objects VAPORISE (satisfying poof, points, gone).
 *  - Animals and people only get STUNNED — they sit down dizzy and are easier
 *    to beam up. Nothing alive is ever destroyed, which keeps the whole game
 *    silly rather than nasty, and turns the laser into a tool rather than a
 *    punishment.
 */

const MAX_BOLTS = 40

export class Lasers {
  constructor(scene) {
    this.scene = scene
    this.bolts = []
    this.cooldown = 0
    this.fireRate = 0.14           // seconds between shots while held
    this.speed = 150
    this.life = 1.4
    this.radius = 5.5              // splash radius on impact

    // One shared geometry + material; bolts are pooled, never allocated live.
    // Chunky and bright: a thin bolt is invisible at this camera distance,
    // and the whole point is that a five-year-old can see they are shooting.
    const geo = new THREE.CapsuleGeometry(0.62, 5.2, 4, 8)
    geo.rotateX(Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, depthWrite: false })
    this.core = new THREE.InstancedMesh(geo, mat, MAX_BOLTS)
    this.core.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.core.frustumCulled = false
    this.core.count = MAX_BOLTS
    scene.add(this.core)

    const glowGeo = new THREE.SphereGeometry(2.1, 8, 6)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd0dc, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.glow = new THREE.InstancedMesh(glowGeo, glowMat, MAX_BOLTS)
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.glow.frustumCulled = false
    this.glow.count = MAX_BOLTS
    scene.add(this.glow)

    this._m = new THREE.Matrix4()
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < MAX_BOLTS; i++) {
      this.core.setMatrixAt(i, this._hidden)
      this.glow.setMatrixAt(i, this._hidden)
    }
  }

  /** Fire toward a ground point, respecting the cooldown. Returns true if fired. */
  tryFire(from, aim, dt) {
    this.cooldown -= dt
    if (this.cooldown > 0) return false
    if (this.bolts.length >= MAX_BOLTS) return false
    this.cooldown = this.fireRate
    const dir = aim.clone().sub(from).normalize()
    this.bolts.push({
      pos: from.clone(),
      dir,
      life: this.life,
      spin: Math.random() * Math.PI,
    })
    return true
  }

  update(dt, world, onHit) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life -= dt
      b.pos.addScaledVector(b.dir, this.speed * dt)

      const ground = world.heightAt(b.pos.x, b.pos.z)
      const hitGround = b.pos.y <= ground + 0.4
      const outOfRange = b.life <= 0
        || Math.abs(b.pos.x) > world.half + 20 || Math.abs(b.pos.z) > world.half + 20

      if (hitGround || outOfRange) {
        if (hitGround) onHit?.(b.pos.clone().setY(ground + 0.4))
        this.bolts.splice(i, 1)
      }
    }
    this._sync()
  }

  _sync() {
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i < MAX_BOLTS; i++) {
      const b = this.bolts[i]
      if (!b) {
        this.core.setMatrixAt(i, this._hidden)
        this.glow.setMatrixAt(i, this._hidden)
        continue
      }
      q.setFromUnitVectors(up, b.dir)
      // The capsule was rotated to point down +Z, so align that axis.
      const m = this._m.compose(b.pos, new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(new THREE.Vector3(), b.dir, up)), one)
      this.core.setMatrixAt(i, m)
      const g = new THREE.Matrix4().compose(b.pos, q,
        new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + Math.sin(b.life * 30) * 0.15))
      this.glow.setMatrixAt(i, g)
    }
    this.core.instanceMatrix.needsUpdate = true
    this.glow.instanceMatrix.needsUpdate = true
  }
}

/**
 * The puff left behind when something is vaporised. Pooled rings that expand
 * and fade — cheap, and reads clearly at the game's camera distance.
 */
export class Poofs {
  constructor(scene, count = 24) {
    const geo = new THREE.SphereGeometry(1, 10, 8)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe3a8, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = count
    scene.add(this.mesh)
    this.slots = Array.from({ length: count }, () => ({ life: 0, pos: new THREE.Vector3(), size: 1 }))
    this.next = 0
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    this._q = new THREE.Quaternion()
  }

  burst(pos, size = 4) {
    const s = this.slots[this.next = (this.next + 1) % this.slots.length]
    s.life = 0.45
    s.max = 0.45
    s.size = size
    s.pos.copy(pos)
  }

  update(dt) {
    const m = new THREE.Matrix4()
    const v = new THREE.Vector3()
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (s.life <= 0) { this.mesh.setMatrixAt(i, this._hidden); continue }
      s.life -= dt
      const k = Math.max(0, s.life / s.max)
      const grow = (1 - k) * s.size + 0.6
      v.setScalar(grow)
      this.mesh.setMatrixAt(i, m.compose(s.pos, this._q, v))
    }
    this.mesh.material.opacity = 0.7
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
