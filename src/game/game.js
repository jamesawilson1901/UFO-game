import * as THREE from 'three'
import { assets, fitToWidth } from '../core/assets.js'
import { audio } from '../core/audio.js'
import { Input } from '../core/input.js'
import { makeRng } from '../core/rng.js'
import { World } from '../world/world.js'
import { THEMES, WORLD_HALF } from '../world/themes.js'
import { Ufo } from './ufo.js'
import { Lasers, Poofs } from './laser.js'
import { Rival } from './rival.js'
import { CritterEntity, HumanEntity, PropEntity, LOOT, STATE } from './entities.js'
import { Hud } from '../ui/hud.js'
import { Minimap } from '../ui/minimap.js'
import { rankFor } from './ranks.js'

const SFX = {
  beam: 'forceField_002', beamStart: 'forceField_000',
  collect: 'laserSmall_000', collectBig: 'laserRetro_000',
  combo: 'computerNoise_001', boost: 'thrusterFire_000',
  drop: 'impactMetal_000', moo: 'cow-moo', engine: 'spaceEngineLow_000',
  full: 'computerNoise_002', deposit: 'doorOpen_000',
  laser: 'laserSmall_001', zap: 'laserRetro_001',
  vaporise: 'explosionCrunch_000', bigBoom: 'lowFrequency_explosion_000',
  clang: 'impactMetal_003', alarm: 'computerNoise_002',
}

export const ROUND_SECONDS = 180

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.input = new Input()
    this.hud = new Hud()
    this.entities = []
    this.running = false
    this._tmpV = new THREE.Vector3()
    this.onRoundEnd = null
    this.playedThemes = []
  }

  /* ══ engine setup: done once, survives every round ═══════════════ */

  async initEngine() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12

    this.camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.5, 900)
    this.camRig = new THREE.Object3D()

    this.minimap = new Minimap()
    this.input.attach()
    addEventListener('resize', () => this._resize())
    this._resize()
    await this._loadAudio()
  }

  /**
   * Draw from a shuffled bag so every world is seen once before any repeats.
   * Random-with-exclusions would still show the same two worlds four times
   * in an evening, which is exactly what a seven-year-old notices.
   */
  pickTheme() {
    if (!this._bag?.length) {
      this._bag = THEMES.slice()
      for (let i = this._bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]]
      }
      // Never open the next bag with the world we just finished.
      if (this.playedThemes.at(-1) === this._bag.at(-1)?.id && this._bag.length > 1) {
        this._bag.unshift(this._bag.pop())
      }
    }
    const t = this._bag.pop()
    this.playedThemes.push(t.id)
    return t
  }

  /* ══ per-round world build ═══════════════════════════════════════ */

  async startRound(theme, onStep) {
    const step = onStep ?? (() => {})
    this.theme = theme
    this.rng = makeRng((Math.random() * 1e9) | 0)

    this._teardown()

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far)
    this.scene.add(this.camRig)

    step('Hanging the sky…')
    if (theme.sky) {
      const tex = await assets.texture(theme.sky)
      if (tex) {
        tex.mapping = THREE.EquirectangularReflectionMapping
        tex.colorSpace = THREE.SRGBColorSpace
        this.scene.background = tex
      } else this.scene.background = new THREE.Color(theme.skyColor ?? 0x8ec5e8)
    } else {
      this.scene.background = new THREE.Color(theme.skyColor ?? 0x8ec5e8)
    }
    this._lights(theme)

    this.world = new World(this.scene, this.rng, theme)
    await this.world.build(step)

    step('Powering the saucer…')
    this.ufo = new Ufo(this.scene)
    await this.ufo.load()
    this.ufo.pos.set(0, 40, 60)

    this.lasers = new Lasers(this.scene)
    this.poofs = new Poofs(this.scene)
    this.rival = new Rival(this.scene)
    await this.rival.load()

    step('Waking the locals…')
    await HumanEntity.preload(theme.npcs)
    await HumanEntity.buildSources(theme.npcs)
    await this._populate(theme, step)

    this._particles()

    // Round state.
    this.score = 0
    this.combo = 1
    this.comboTimer = 0
    this.comboWindow = 4.2
    this.cargo = []
    this.cargoMax = 8
    this.t = 0
    this.shake = 0
    this.timeLeft = ROUND_SECONDS
    this.stats = { abducted: 0, best: {}, mooCount: 0, vaporised: 0, rivalsDowned: 0, stolen: 0 }
    this.respawns = []
    this.rankIndex = 0
    this.dropped = []
    this.nextRivalAt = 32 + Math.random() * 18
    this.ended = false

    this.hud.setScore(0)
    this.hud.setCargo([])
    this.hud.setZone(theme.name)
    this.hud.setTime(this.timeLeft)
    this._paintRank(true)
    audio.playMusic(theme.music, { volume: 0.3 })
    return this
  }

  /**
   * Free what this round built — terrain, merged scenery, per-critter
   * geometry — and nothing else. Anything tagged `shared` belongs to the
   * asset cache and is reused by every later round.
   */
  _teardown() {
    if (!this.scene) return
    const seen = new Set()
    this.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh || o.isPoints)) return
      if (o.geometry && !o.geometry.userData.shared && !seen.has(o.geometry)) {
        seen.add(o.geometry)
        o.geometry.dispose()
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || m.userData.shared || seen.has(m)) continue
        seen.add(m)
        m.dispose()
      }
    })
    this.entities = []
    this.dropped = []
    this.scene = null
  }

  _lights(theme) {
    const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity)
    sun.position.set(80, 150, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const d = 100
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 20, far: 420 })
    sun.shadow.bias = -0.0012
    sun.shadow.normalBias = 0.5
    this.scene.add(sun, sun.target)
    this.sun = sun
    this.scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity))
    this.scene.add(new THREE.AmbientLight(0xffffff, theme.ambient ?? 0.28))
  }

  /* ══ population ══════════════════════════════════════════════════ */

  async _populate(theme, step) {
    const rng = this.rng
    const spot = (radius = WORLD_HALF - 30, minH = 1.2) => this.world.randomSpot(rng, { radius, minH })

    for (const [kind, count] of Object.entries(theme.critters ?? {})) {
      for (let i = 0; i < count; i++) {
        let s
        if (this.world.paddocks && rng.chance(0.55)) {
          const pd = rng.pick(this.world.paddocks)
          s = { x: pd.x + rng.range(-pd.w / 2 + 4, pd.w / 2 - 4),
                z: pd.z + rng.range(-pd.h / 2 + 4, pd.h / 2 - 4) }
          if (this.world.heightAt(s.x, s.z) < 1.2) s = spot()
        } else s = spot()
        if (!s) continue
        this._add(new CritterEntity(kind, s.x, s.z, rng), { type: 'critter', kind })
      }
    }

    // One golden animal: rare, fast, worth eight of its cousins.
    for (let i = 0; i < 2; i++) {
      const s = spot()
      if (s) this._add(new CritterEntity('cow', s.x, s.z, rng, { golden: true }),
        { type: 'critter', kind: 'cow', golden: true })
    }

    step('Hiring the extras…')
    for (let i = 0; i < (theme.npcCount ?? 0); i++) {
      const s = spot()
      if (!s) continue
      const kind = rng.pick(theme.npcs)
      this._add(new HumanEntity(kind, s.x, s.z, rng), { type: 'human', kind })
    }

    step('Scattering the loot…')
    this._propScenes = new Map()
    for (const name of theme.loot ?? []) {
      const def = LOOT[name]
      if (!def) continue
      const g = await assets.glb(def.path)
      if (!g) continue
      this._propScenes.set(name, g.scene)
      const n = def.points > 200 ? 8 : 16
      for (let i = 0; i < n; i++) {
        const s = spot()
        if (!s) continue
        const m = g.scene.clone(true)
        fitToWidth(m, def.size)
        this._add(new PropEntity(m, s.x, s.z, {
          label: def.label, icon: def.icon, points: def.points,
          radius: def.size, mass: 0.8 + def.size * 0.25,
        }), { type: 'prop', name })
      }
    }
  }

  _add(e, spec = null) {
    e.spawnSpec = spec
    this.entities.push(e)
    this.scene.add(e.root)
    return e
  }

  /**
   * The world restocks or a determined seven-year-old strips it bare well
   * before the timer runs out.
   */
  _queueRespawn(e) {
    if (!e.spawnSpec) return
    this.respawns.push({ spec: e.spawnSpec, at: this.t + 12 + this.rng() * 14 })
  }

  _drainRespawns() {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]
      if (this.t < r.at) continue
      this.respawns.splice(i, 1)
      const s = this.world.randomSpot(this.rng, { clear: 70, from: this.ufo.pos })
      if (!s) { this.respawns.push({ spec: r.spec, at: this.t + 5 }); continue }
      const { spec } = r
      if (spec.type === 'critter') {
        this._add(new CritterEntity(spec.kind, s.x, s.z, this.rng, { golden: spec.golden }), spec)
      } else if (spec.type === 'human') {
        this._add(new HumanEntity(spec.kind, s.x, s.z, this.rng), spec)
      } else if (spec.type === 'prop') {
        const def = LOOT[spec.name]
        const scene = this._propScenes?.get(spec.name)
        if (!def || !scene) continue
        const m = scene.clone(true)
        fitToWidth(m, def.size)
        this._add(new PropEntity(m, s.x, s.z, {
          label: def.label, icon: def.icon, points: def.points,
          radius: def.size, mass: 0.8 + def.size * 0.25,
        }), spec)
      }
    }
  }

  /* ══ audio ═══════════════════════════════════════════════════════ */

  async _loadAudio() {
    audio.unlock()
    const files = {
      forceField_002: 'assets/audio/sfx/forceField_002.ogg',
      forceField_000: 'assets/audio/sfx/forceField_000.ogg',
      laserSmall_000: 'assets/audio/sfx/laserSmall_000.ogg',
      laserSmall_001: 'assets/audio/sfx/laserSmall_001.ogg',
      laserRetro_000: 'assets/audio/sfx/laserRetro_000.ogg',
      laserRetro_001: 'assets/audio/sfx/laserRetro_001.ogg',
      computerNoise_001: 'assets/audio/sfx/computerNoise_001.ogg',
      computerNoise_002: 'assets/audio/sfx/computerNoise_002.ogg',
      thrusterFire_000: 'assets/audio/sfx/thrusterFire_000.ogg',
      impactMetal_000: 'assets/audio/sfx/impactMetal_000.ogg',
      impactMetal_003: 'assets/audio/sfx/impactMetal_003.ogg',
      spaceEngineLow_000: 'assets/audio/sfx/spaceEngineLow_000.ogg',
      doorOpen_000: 'assets/audio/sfx/doorOpen_000.ogg',
      explosionCrunch_000: 'assets/audio/sfx/explosionCrunch_000.ogg',
      lowFrequency_explosion_000: 'assets/audio/sfx/lowFrequency_explosion_000.ogg',
      'cow-moo': 'assets/audio/sfx/cow-moo.wav',
      slime_000: 'assets/audio/sfx/slime_000.ogg',
      slime_002: 'assets/audio/sfx/slime_000.ogg',
    }
    await Promise.all(Object.entries(files).map(([k, p]) => audio.load(k, p)))
    this.beamHum = audio.loop(SFX.beam, { volume: 0.5, rate: 0.85 })
    this.engineHum = audio.loop(SFX.engine, { volume: 0.28 })
  }

  /* ══ particles ═══════════════════════════════════════════════════ */

  _particles() {
    const N = 300
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    this.sparkles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.2, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }))
    this.sparkles.frustumCulled = false
    this.scene.add(this.sparkles)
    this._pool = Array.from({ length: N }, () => ({
      life: 0, maxLife: 1, vel: new THREE.Vector3(), pos: new THREE.Vector3(), col: new THREE.Color(),
    }))
    this._pNext = 0
  }

  burst(at, color = 0xffe066, n = 18, spread = 6) {
    for (let i = 0; i < n; i++) {
      const p = this._pool[this._pNext = (this._pNext + 1) % this._pool.length]
      p.life = 0.75 + Math.random() * 0.5
      p.maxLife = p.life
      p.pos.copy(at)
      p.vel.set((Math.random() - 0.5) * spread, Math.random() * spread * 1.1 + 2,
        (Math.random() - 0.5) * spread)
      p.col.setHex(color)
    }
  }

  _updateParticles(dt) {
    const pos = this.sparkles.geometry.attributes.position
    const col = this.sparkles.geometry.attributes.color
    for (let i = 0; i < this._pool.length; i++) {
      const p = this._pool[i]
      if (p.life > 0) {
        p.life -= dt
        p.vel.y -= 14 * dt
        p.pos.addScaledVector(p.vel, dt)
        const k = Math.max(0, p.life / p.maxLife)
        pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z)
        col.setXYZ(i, p.col.r * k, p.col.g * k, p.col.b * k)
      } else {
        pos.setXYZ(i, 0, -9999, 0)
        col.setXYZ(i, 0, 0, 0)
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true
  }

  /* ══ loop ════════════════════════════════════════════════════════ */

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this._frame = this._frame.bind(this)
    requestAnimationFrame(this._frame)
  }

  pause(on) {
    this.paused = on
    audio.duckMusic(on)
    if (on) this.input.releaseAll()
    else this.last = performance.now()
  }

  _frame(now) {
    if (!this.running) return
    requestAnimationFrame(this._frame)
    let dt = (now - this.last) / 1000
    this.last = now
    if (this.paused || !this.scene) {
      if (this.scene) this.renderer.render(this.scene, this.camera)
      return
    }
    this.update(Math.min(dt, 1 / 20))
    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()
  }

  update(dt) {
    this.t += dt
    const { input, ufo, world } = this
    input.poll()

    if (!this.ended) {
      this.timeLeft -= dt
      this.hud.setTime(this.timeLeft)
      if (this.timeLeft <= 0) { this._endRound(); return }
      // Countdown urgency in the last ten seconds.
      const s = Math.ceil(this.timeLeft)
      if (s <= 10 && s !== this._lastTick) {
        this._lastTick = s
        audio.play(SFX.clang, { volume: 0.5, rate: 1 + (10 - s) * 0.05 })
        this.hud.pulseTime()
      }
    }

    const wasBeaming = ufo.beamOn
    ufo.update(dt, input, world, this.t)
    if (ufo.beamOn && !wasBeaming) audio.play(SFX.beamStart, { volume: 0.45 })
    this.beamHum?.set(ufo.beamPower * 0.85)
    this.engineHum?.set(0.16 + Math.hypot(ufo.vel.x, ufo.vel.z) / 100 + ufo.boost * 0.35)

    if (input.consume('boost')) audio.play(SFX.boost, { volume: 0.45 })
    if (input.consume('moo')) this._moo()

    this._fireLasers(dt)
    this._updateRival(dt)

    /* ── entities ───────────────────────────────────────────────── */
    const ctx = { world, ufo, t: this.t, audio }
    const px = ufo.pos.x, pz = ufo.pos.z
    for (const e of this.entities) {
      if (e.state === STATE.DONE) continue
      const d = Math.hypot(e.root.position.x - px, e.root.position.z - pz)
      e.root.visible = d < 250
      if (d > 175) continue
      e.update(dt, ctx)
      if (e.collected) this._collect(e)
    }

    if (this.combo > 1) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) { this.combo = 1; this.comboTimer = 0 }
      this.hud.setCombo(this.combo, this.comboTimer / this.comboWindow)
    } else this.hud.setCombo(1, 0)

    this._drainRespawns()
    this._updateParticles(dt)
    this.poofs.update(dt)
    this._camera(dt)
    this.minimap.draw(ufo, dt, this.rival)
  }

  /* ══ lasers ══════════════════════════════════════════════════════ */

  _fireLasers(dt) {
    const { ufo, input } = this
    if (input.buttons.laser) {
      // Aim at whatever is most worth hitting: the rival if it's close,
      // otherwise straight down at the ground under the saucer.
      let aim
      if (this.rival.alive && this.rival.pos.distanceTo(ufo.pos) < 120) {
        aim = this.rival.pos.clone()
      } else {
        aim = new THREE.Vector3(ufo.pos.x, world_ground(this.world, ufo.pos), ufo.pos.z)
      }
      const muzzle = ufo.pos.clone().add(new THREE.Vector3(0, -1.5, 0))
      if (this.lasers.tryFire(muzzle, aim, dt)) {
        audio.play(SFX.laser, { volume: 0.4, rate: 1.3, throttle: 0.05 })
      }
    } else {
      this.lasers.cooldown = Math.max(0, this.lasers.cooldown - dt)
    }

    // Bolts in flight can clip the rival mid-air.
    if (this.rival.alive) {
      for (let i = this.lasers.bolts.length - 1; i >= 0; i--) {
        const b = this.lasers.bolts[i]
        if (b.pos.distanceTo(this.rival.pos) > 7) continue
        this.lasers.bolts.splice(i, 1)
        this.poofs.burst(b.pos, 5)
        const res = this.rival.hit(1)
        audio.play(SFX.clang, { volume: 0.6, rate: 1.2 })
        this.burst(b.pos.clone(), 0xff6b6b, 12, 6)
        if (res === 'down') {
          this.stats.rivalsDowned++
          this.score += 750
          this.hud.setScore(this.score)
          this._paintRank()
          this._say('GOT HIM! +750', 0xffd23f)
          audio.play(SFX.bigBoom, { volume: 0.8 })
          this.shake = 1
        } else if (res) {
          this._sayAt(this.rival.pos, res)
        }
      }
    }

    this.lasers.update(dt, this.world, (at) => this._laserImpact(at))
  }

  /** Ground hit: vaporise objects for points, stun anything alive. */
  _laserImpact(at) {
    this.poofs.burst(at, 6)
    audio.play(SFX.vaporise, { volume: 0.35, rate: 1.4, throttle: 0.06 })
    const r = this.lasers.radius
    let hitSomething = false

    for (const e of this.entities) {
      if (e.state === STATE.DONE) continue
      const d = Math.hypot(e.root.position.x - at.x, e.root.position.z - at.z)
      if (d > r) continue
      hitSomething = true

      if (e instanceof PropEntity) {
        // Objects go up in a puff and pay out.
        const gained = Math.round(e.points * 0.6)
        this.score += gained
        this.stats.vaporised++
        this.poofs.burst(e.root.position.clone(), 8)
        this.burst(e.root.position.clone(), 0xffb347, 22, 8)
        this._popupAt(e.root.position, `+${gained}`, true)
        e.state = STATE.DONE
        e.root.visible = false
        this._queueRespawn(e)
        setTimeout(() => {
          e.dispose()
          const i = this.entities.indexOf(e)
          if (i >= 0) this.entities.splice(i, 1)
        }, 40)
      } else if (e.zap) {
        // Living things only get dizzy — nothing dies in this game.
        if (e.stun <= 0) {
          this.burst(e.root.position.clone().setY(e.root.position.y + 2), 0x9dd6ff, 10, 4)
          this._popupAt(e.root.position, 'DIZZY!', true)
        }
        e.zap(4)
      }
    }
    if (hitSomething) {
      this.hud.setScore(this.score)
      this._paintRank()
      audio.play(SFX.zap, { volume: 0.5, throttle: 0.08 })
    }
  }

  /* ══ rival ═══════════════════════════════════════════════════════ */

  _updateRival(dt) {
    if (!this.rival.alive) {
      if (!this.ended && this.t > this.nextRivalAt) {
        const taunt = this.rival.spawn(this.world, this.ufo.pos, this.rng)
        this.nextRivalAt = this.t + 60 + Math.random() * 30
        this._say(`🛸 ${taunt}`, 0x8dff6a)
        audio.play(SFX.alarm, { volume: 0.6, rate: 0.8 })
        this.hud.setAlert('RIVAL UFO INCOMING!')
      }
      return
    }

    const ev = this.rival.update(dt, {
      ufo: this.ufo, world: this.world, t: this.t, loot: this.dropped,
    })
    if (!ev) return

    if (ev.type === 'rammed') {
      // Knocked sideways, and the hold pops open.
      this.ufo.vel.addScaledVector(ev.dir.clone().negate(), -70)
      this.shake = 1
      audio.play(SFX.clang, { volume: 0.9, rate: 0.7 })
      audio.play(SFX.bigBoom, { volume: 0.5 })
      this._say('BONK! You dropped your cows!', 0xff6b6b)
      this._spillCargo()
    } else if (ev.type === 'stole') {
      this.stats.stolen++
      const i = this.dropped.indexOf(ev.entity)
      if (i >= 0) this.dropped.splice(i, 1)
      ev.entity.state = STATE.DONE
      ev.entity.root.visible = false
      setTimeout(() => ev.entity.dispose(), 40)
      this._say('He stole one! Zap him!', 0xff9b9b)
    } else if (ev.type === 'crashed') {
      this.poofs.burst(ev.at, 14)
      this.burst(ev.at, 0xff8c42, 50, 12)
      audio.play(SFX.bigBoom, { volume: 0.9 })
      this.hud.setAlert('')
    } else if (ev.type === 'escaped') {
      this.hud.setAlert('')
      this._say('He got away with your cows!', 0xff9b9b)
    }
  }

  /** Ram knocks the hold open: cargo becomes real objects on the ground. */
  _spillCargo() {
    const n = Math.min(this.cargo.length, 4)
    for (let i = 0; i < n; i++) {
      const item = this.cargo.pop()
      const a = (i / n) * Math.PI * 2
      const x = this.ufo.pos.x + Math.cos(a) * 14
      const z = this.ufo.pos.z + Math.sin(a) * 14
      const kind = item.critter ?? 'cow'
      const e = this._add(new CritterEntity(kind, x, z, this.rng), { type: 'critter', kind })
      e.root.position.y = this.ufo.pos.y - 4
      e.velY = 2
      e.panic = 1
      e.state = STATE.FLEE
      this.dropped.push(e)
    }
    this.hud.setCargo(this.cargo.map((c) => c.icon))
    if (n) audio.play(SFX.moo, { volume: 0.8, rate: 1.3 })
  }

  /* ══ actions ═════════════════════════════════════════════════════ */

  _moo() {
    audio.play(SFX.moo, { volume: 0.9, rate: 0.7, jitter: 0.05 })
    this.stats.mooCount++
    this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 3), 0xff9ecb, 18, 9)
    for (const e of this.entities) {
      if (e.state === STATE.DONE) continue
      const d = Math.hypot(e.root.position.x - this.ufo.pos.x, e.root.position.z - this.ufo.pos.z)
      if (d < 60 && e.stun <= 0) { e.panic = 1; e.state = STATE.FLEE; e.think = 0 }
    }
    this._say('MOOOOO!', 0xff9ecb)
  }

  _collect(e) {
    e.collected = false
    e.state = STATE.DONE
    e.root.visible = false

    const mult = this.combo
    const gained = Math.round(e.points * mult)
    this.score += gained
    this.stats.abducted++
    this.stats.best[e.label] = (this.stats.best[e.label] ?? 0) + 1

    this.combo = Math.min(9, this.combo + 1)
    this.comboTimer = this.comboWindow

    this.cargo.push({ icon: e.icon, label: e.label, critter: e.built ? e.def?.id : null })
    if (this.cargo.length > this.cargoMax) this.cargo.shift()
    this.hud.setCargo(this.cargo.map((c) => c.icon))
    this.hud.setScore(this.score)
    this._paintRank()

    const big = e.points >= 200
    if (e.golden) { this.burst(this.ufo.pos.clone(), 0xffd23f, 60, 12); this.shake = 1 }
    audio.play(big ? SFX.collectBig : SFX.collect, {
      volume: big ? 0.7 : 0.45, rate: 1 + this.combo * 0.06, throttle: 0.02,
    })
    if (this.combo > 2) audio.play(SFX.combo, { volume: 0.3, rate: 1 + this.combo * 0.1 })
    this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 3),
      big ? 0xffd23f : 0x9dffbe, big ? 34 : 18, big ? 9 : 6)
    this.shake = Math.min(1, this.shake + (big ? 0.5 : 0.2))

    this._popupAt(this.ufo.pos, `+${gained.toLocaleString()}`)
    this._popupAt(this.ufo.pos, `${e.icon} ${e.label}${mult > 1 ? `  x${mult}` : ''}`, true, 36)

    const i = this.dropped.indexOf(e)
    if (i >= 0) this.dropped.splice(i, 1)
    this._queueRespawn(e)
    setTimeout(() => {
      e.dispose()
      const j = this.entities.indexOf(e)
      if (j >= 0) this.entities.splice(j, 1)
    }, 60)
  }

  /* ══ hud helpers ═════════════════════════════════════════════════ */

  _popupAt(worldPos, text, small = false, yOffset = 0) {
    this._tmpV.copy(worldPos).project(this.camera)
    const sx = (this._tmpV.x * 0.5 + 0.5) * innerWidth
    const sy = (-this._tmpV.y * 0.5 + 0.5) * innerHeight + yOffset
    this.hud.popup(text, sx, sy, small)
  }

  _say(text, color) { this.hud.toast(text, color) }
  _sayAt(worldPos, text) { this._popupAt(worldPos, text, true) }

  _paintRank(silent = false) {
    const { index, rank, frac } = rankFor(this.score)
    this.hud.setRank(rank.name, frac)
    if (index > this.rankIndex && !silent) {
      audio.play(SFX.deposit, { volume: 0.7 })
      this.hud.popup(`NEW RANK: ${rank.name}!`, innerWidth / 2, innerHeight * 0.4)
      this.burst(this.ufo.pos.clone(), 0xffd23f, 46, 11)
      this.shake = 1
    }
    this.rankIndex = index
  }

  /* ══ camera ══════════════════════════════════════════════════════ */

  _camera(dt) {
    const u = this.ufo.pos
    // Closer and lower than a true top-down so animals stay identifiable.
    const back = 33, up = 36
    const lead = 0.5
    const want = new THREE.Vector3(u.x + this.ufo.vel.x * lead, u.y + up,
      u.z + this.ufo.vel.z * lead + back)
    this.camRig.position.lerp(want, Math.min(1, dt * 3.4))

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.2)
      const s = this.shake * this.shake * 2
      this.camRig.position.x += (Math.random() - 0.5) * s
      this.camRig.position.y += (Math.random() - 0.5) * s
      this.camRig.position.z += (Math.random() - 0.5) * s
    }
    this.camera.position.copy(this.camRig.position)
    this.camera.lookAt(u.x, u.y - 15, u.z)

    this.sun.position.set(u.x + 80, u.y + 130, u.z + 60)
    this.sun.target.position.set(u.x, 0, u.z)
    this.sun.target.updateMatrixWorld()
  }

  _endRound() {
    this.ended = true
    this.timeLeft = 0
    this.hud.setTime(0)
    this.input.releaseAll()
    audio.play(SFX.bigBoom, { volume: 0.5, rate: 0.7 })
    this.onRoundEnd?.({
      score: this.score,
      theme: this.theme,
      stats: this.stats,
      rank: rankFor(this.score).rank,
    })
  }

  _resize() {
    const w = innerWidth, h = innerHeight
    this.camera.aspect = w / h
    this.camera.fov = h > w ? 66 : 54
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  }
}

function world_ground(world, p) {
  return world.heightAt(p.x, p.z)
}
