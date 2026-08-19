import * as THREE from 'three'
import { assets, fitToWidth } from '../core/assets.js'

/* Scrolling energy rings inside the beam cone. Cheap, and it sells the
   "something is being sucked upwards" idea far better than a flat cone. */
const beamVert = /* glsl */`
  varying vec2 vUv;
  varying float vY;
  void main() {
    vUv = uv;
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const beamFrag = /* glsl */`
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vY;
  void main() {
    // Rings travel up the cone.
    float rings = sin((vUv.y * 14.0) + uTime * 7.0) * 0.5 + 0.5;
    rings = pow(rings, 2.2);
    // Fade out at the rim and at the ground end.
    float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
    float vert = mix(0.35, 1.0, vUv.y);
    // Kept deliberately faint: an opaque cone this wide hides the saucer,
    // and the saucer is the thing the player is steering.
    float a = (0.12 + rings * 0.34) * vert * uPower;
    a *= 0.5 + edge * 0.5;
    gl_FragColor = vec4(uColor + rings * 0.25, a);
  }
`

/** Frame-rate independent smoothing factor: reaches ~63% of the gap in 1/k s. */
const smooth = (k, dt) => 1 - Math.exp(-k * dt)

export class Ufo {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.pos = new THREE.Vector3(0, 26, 40)
    this.vel = new THREE.Vector3()
    this.heading = 0
    this.tilt = new THREE.Vector2()
    this.beamOn = false
    this.beamPower = 0
    this.boost = 0
    this.boostFuel = 1

    /* Tuning. Quick and glidey: children steer in long sweeps rather than
       precise nudges, so the saucer wants a high top speed and enough
       momentum to carry through a turn without feeling twitchy. */
    this.accel = 135
    this.maxSpeed = 52
    this.boostMax = 88
    this.drag = 2.5
    this.hoverY = 23
    this.minY = 12
    this.maxY = 50

    this.beamRadius = 9
  }

  async load() {
    const cached = await assets.fbxModel('assets/ufo/ufo.fbx', 'assets/ufo/UFOTexture.png')
    // Clone: the cache hands back one shared instance, and an Object3D can
    // only have a single parent, so reusing it would tear the saucer out of
    // whichever scene held it last.
    const model = cached ? cached.clone(true) : null
    this.hull = new THREE.Group()
    if (model) {
      // The saucer is a flat disc: fitting it by height would scale it to
      // absurd width. Size it across instead.
      fitToWidth(model, 13)
      model.position.y = 0
      this.hull.add(model)
    } else {
      // Fallback saucer so the game still runs if the FBX is unavailable.
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(6.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xc8d2ff, metalness: 0.2, roughness: 0.4 }))
      body.scale.y = 0.28
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2.1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.75 }))
      dome.position.y = 0.7
      this.hull.add(body, dome)
    }
    this.group.add(this.hull)

    /* ── running lights around the rim ─────────────────────────── */
    this.lights = []
    const bulbGeo = new THREE.SphereGeometry(0.46, 8, 6)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const m = new THREE.MeshBasicMaterial({ color: 0xffe066 })
      const b = new THREE.Mesh(bulbGeo, m)
      b.position.set(Math.cos(a) * 5.6, -0.5, Math.sin(a) * 5.6)
      this.hull.add(b)
      this.lights.push(m)
    }

    /* ── beam cone ─────────────────────────────────────────────── */
    this.beamUniforms = {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uColor: { value: new THREE.Color(0x7dffa8) },
    }
    const cone = new THREE.CylinderGeometry(0.32, 1, 1, 28, 1, true)
    this.beam = new THREE.Mesh(cone, new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      // BackSide only: an additive double-sided cone draws its near and far
      // walls over each other, doubling the brightness and hiding whatever
      // is inside it — including the cow you are trying to watch.
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }))
    this.beam.visible = false
    this.group.add(this.beam)

    // Glowing puddle where the beam lands.
    /* A soft ring where the beam lands rather than a filled disc: a bright
       additive circle reads as fog and hides the very thing being beamed. */
    this.splash = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 32),
      new THREE.MeshBasicMaterial({
        color: 0x9dffbe, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide,
      }))
    this.splash.rotation.x = -Math.PI / 2
    this.splash.visible = false
    this.group.add(this.splash)

    this.beamLight = new THREE.PointLight(0x8dffb4, 0, 60, 2)
    this.group.add(this.beamLight)

    this.scene.add(this.group)
    return this
  }

  /** Where the beam hits the ground, and its radius there. */
  beamFootprint(groundY) {
    const drop = Math.max(1, this.pos.y - groundY)
    return { y: groundY, radius: this.beamRadius * (0.45 + drop / 40) }
  }

  update(dt, input, world, t) {
    /* ── movement ───────────────────────────────────────────────── */
    const mv = input.move
    const wantBoost = input.buttons.boost && this.boostFuel > 0.02
    this.boost += ((wantBoost ? 1 : 0) - this.boost) * Math.min(1, dt * 8)
    this.boostFuel = THREE.MathUtils.clamp(
      this.boostFuel + (wantBoost ? -dt * 0.42 : dt * 0.24), 0, 1)

    const a = this.accel * (1 + this.boost * 0.8)
    this.vel.x += mv.x * a * dt
    this.vel.z += -mv.y * a * dt

    const d = Math.exp(-this.drag * dt)
    this.vel.x *= d
    this.vel.z *= d

    // Full speed while beaming: dragging a cow across a field at a crawl is
    // the least fun part of the game.
    const cap = this.maxSpeed + this.boost * (this.boostMax - this.maxSpeed)
    const sp = Math.hypot(this.vel.x, this.vel.z)
    if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp }

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt

    /* Stay inside the playfield with a soft push-back. Taken from the world
       rather than hardcoded — this was still 232 from when the map was 480
       across, letting the saucer fly 32 units off the edge of the terrain. */
    const lim = world.half - 8
    for (const ax of ['x', 'z']) {
      if (this.pos[ax] > lim) { this.pos[ax] = lim; this.vel[ax] *= -0.3 }
      if (this.pos[ax] < -lim) { this.pos[ax] = -lim; this.vel[ax] *= -0.3 }
    }

    /* ── altitude: hug the terrain, dip while beaming ───────────── */
    const ground = world.heightAt(this.pos.x, this.pos.z)
    const targetY = ground + (this.beamOn ? this.hoverY * 0.78 : this.hoverY)
    // Exponential smoothing rather than a raw lerp factor: `dt * k` changes
    // meaning with frame rate, which is why the same tuning felt different
    // on a phone and a desktop.
    this.pos.y += (THREE.MathUtils.clamp(targetY, this.minY, this.maxY) - this.pos.y)
      * smooth(4.5, dt)
    this.pos.y += Math.sin(t * 1.7) * dt * 1.6      // idle bob

    this.group.position.copy(this.pos)

    /* ── banking ────────────────────────────────────────────────── */
    const tiltX = THREE.MathUtils.clamp(this.vel.z / this.maxSpeed, -1, 1) * 0.34
    const tiltZ = THREE.MathUtils.clamp(-this.vel.x / this.maxSpeed, -1, 1) * 0.34
    this.tilt.x += (tiltX - this.tilt.x) * smooth(6, dt)
    this.tilt.y += (tiltZ - this.tilt.y) * smooth(6, dt)
    this.hull.rotation.x = this.tilt.x
    this.hull.rotation.z = this.tilt.y
    this.hull.rotation.y += dt * (0.7 + this.boost * 2.6)

    /* ── running lights chase ───────────────────────────────────── */
    for (let i = 0; i < this.lights.length; i++) {
      const phase = (t * 3 + i / this.lights.length) % 1
      const lit = phase < 0.3
      this.lights[i].color.setHex(this.beamOn ? (lit ? 0x9dffbe : 0x2b7a4a)
        : (lit ? 0xffe066 : 0x6b5a1e))
    }

    /* ── beam ───────────────────────────────────────────────────── */
    this.beamOn = input.buttons.beam
    const targetPower = this.beamOn ? 1 : 0
    this.beamPower += (targetPower - this.beamPower) * Math.min(1, dt * (this.beamOn ? 11 : 7))

    const visible = this.beamPower > 0.02
    this.beam.visible = visible
    this.splash.visible = visible
    if (visible) {
      // Start the cone below the hull so it never draws over the saucer.
      const top = -3.2
      const drop = this.pos.y - ground + top
      const fp = this.beamFootprint(ground)
      this.beam.scale.set(fp.radius, drop, fp.radius)
      this.beam.position.y = top - drop / 2
      this.beamUniforms.uTime.value = t
      this.beamUniforms.uPower.value = this.beamPower

      this.splash.position.y = top - drop + 0.35
      const pulse = 1 + Math.sin(t * 9) * 0.05
      this.splash.scale.setScalar(fp.radius * pulse)
      this.splash.material.opacity = 0.55 * this.beamPower

      this.beamLight.position.y = -drop * 0.55
      this.beamLight.intensity = 70 * this.beamPower
      this.beamLight.distance = drop * 2.2
    } else {
      this.beamLight.intensity = 0
    }

    this.groundY = ground
  }
}
