import * as THREE from 'three'
import { assets, fitToWidth } from '../core/assets.js'
import { audio } from '../core/audio.js'
import { Input } from '../core/input.js'
import { makeRng } from '../core/rng.js'
import { World } from '../world/world.js'
import { ZONES, MEADOW, zoneAt, WORLD } from '../world/zones.js'
import { Ufo } from './ufo.js'
import { CritterEntity, HumanEntity, PropEntity, HUMANS, STATE } from './entities.js'
import { Hud } from '../ui/hud.js'
import { Minimap } from '../ui/minimap.js'
import { RANKS, rankFor } from './ranks.js'

const SFX = {
  beam: 'forceField_002',
  beamStart: 'forceField_000',
  collect: 'laserSmall_000',
  collectBig: 'laserRetro_000',
  combo: 'computerNoise_001',
  boost: 'thrusterFire_000',
  drop: 'impactMetal_000',
  moo: 'cow-moo',
  engine: 'spaceEngineLow_000',
  full: 'computerNoise_002',
  deposit: 'doorOpen_000',
}

const MEADOW_ZONE = { id: 'meadow', at: [0, 0], radius: 110 }

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.rng = makeRng(20260818)
    this.input = new Input()
    this.hud = new Hud()
    this.entities = []
    this.score = 0
    this.combo = 1
    this.comboTimer = 0
    this.comboWindow = 4.2
    this.cargo = []
    this.cargoMax = 8
    this.running = false
    this.t = 0
    this.shake = 0
    this._tmpV = new THREE.Vector3()
    this.stats = { abducted: 0, best: {}, mooCount: 0 }
    this.rankIndex = 0
    this.respawns = []
    this._propScenes = new Map()
  }

  /* ══ setup ═══════════════════════════════════════════════════════ */

  async init(onStep) {
    const step = onStep ?? (() => {})

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

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xbfd9f2, 230, 460)

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 900)
    this.camRig = new THREE.Object3D()
    this.scene.add(this.camRig)

    step('Hanging the sky…')
    await this._sky()
    this._lights()

    step('Building the world…')
    this.world = new World(this.scene, this.rng)
    await this.world.build(step)

    step('Waking the locals…')
    this.ufo = new Ufo(this.scene)
    await this.ufo.load()

    await HumanEntity.preload()
    await HumanEntity.buildSources()
    await this._spawnAll(step)

    step('Tuning the radio…')
    await this._loadAudio()

    this._particles()
    this.minimap = new Minimap()
    this._rankBadge()
    this.input.attach()
    addEventListener('resize', () => this._resize())
    this._resize()

    return this
  }

  _rankBadge() {
    const el = document.createElement('div')
    el.className = 'rank'
    el.innerHTML = '<b></b><i><u></u></i>'
    document.getElementById('hud').appendChild(el)
    this.rankEl = el
    this.rankLabel = el.querySelector('b')
    this.rankBar = el.querySelector('u')
    this._paintRank(true)
  }

  _paintRank(silent = false) {
    const { index, rank, next, frac } = rankFor(this.score)
    this.rankLabel.textContent = rank.name
    this.rankBar.style.width = `${Math.round(frac * 100)}%`
    if (index > this.rankIndex && !silent) {
      this.rankIndex = index
      this.rankEl.classList.remove('up')
      void this.rankEl.offsetWidth
      this.rankEl.classList.add('up')
      audio.play(SFX.deposit, { volume: 0.7 })
      this.hud.popup(`NEW RANK: ${rank.name}!`, innerWidth / 2, innerHeight * 0.42)
      this.burst(this.ufo.pos.clone(), 0xffd23f, 46, 11)
      this.shake = 1
    }
    this.rankIndex = index
    this.nextRank = next
  }

  async _sky() {
    const tex = await assets.texture('assets/sky/Panorama_Sky_01-512x512.png')
    if (tex) {
      tex.mapping = THREE.EquirectangularReflectionMapping
      tex.colorSpace = THREE.SRGBColorSpace
      this.scene.background = tex
    } else {
      this.scene.background = new THREE.Color(0x8ec5e8)
    }
  }

  _lights() {
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.5)
    sun.position.set(80, 150, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    // Shadow camera follows the player, so it only needs to cover the view.
    const d = 95
    sun.shadow.camera.left = -d
    sun.shadow.camera.right = d
    sun.shadow.camera.top = d
    sun.shadow.camera.bottom = -d
    sun.shadow.camera.near = 20
    sun.shadow.camera.far = 420
    sun.shadow.bias = -0.0012
    sun.shadow.normalBias = 0.5
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun

    this.scene.add(new THREE.HemisphereLight(0xd8ecff, 0x5a6b3a, 1.35))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28))
  }

  /* ══ population ══════════════════════════════════════════════════ */

  async _spawnAll(step) {
    const rng = this.rng

    // Farm animals cluster inside their zone, favouring the paddocks.
    for (const zn of ZONES) {
      for (const [kind, count] of Object.entries(zn.critters ?? {})) {
        for (let i = 0; i < count; i++) {
          let x, z
          if (zn.id === 'farm' && this.world.paddocks && rng.chance(0.62)) {
            const pd = rng.pick(this.world.paddocks)
            x = pd.x + rng.range(-pd.w / 2 + 3, pd.w / 2 - 3)
            z = pd.z + rng.range(-pd.h / 2 + 3, pd.h / 2 - 3)
          } else {
            const a = rng.range(0, Math.PI * 2)
            const r = Math.sqrt(rng()) * zn.radius * 0.86
            x = zn.at[0] + Math.cos(a) * r
            z = zn.at[1] + Math.sin(a) * r
          }
          if (this.world.heightAt(x, z) < 0.6) continue
          this._add(new CritterEntity(kind, x, z, rng), { type: 'critter', kind, zone: zn.id })
        }
      }
    }

    /* One golden cow per district: rare, fast, and worth eight ordinary
       ones. Gives a five-year-old something to point at and shout about. */
    for (const zn of ZONES) {
      for (let tries = 0; tries < 30; tries++) {
        const a = rng.range(0, Math.PI * 2)
        const r = Math.sqrt(rng()) * zn.radius * 0.75
        const x = zn.at[0] + Math.cos(a) * r
        const z = zn.at[1] + Math.sin(a) * r
        if (this.world.heightAt(x, z) < 1.2) continue
        this._add(new CritterEntity('cow', x, z, rng, { golden: true }),
          { type: 'critter', kind: 'cow', zone: zn.id, golden: true })
        break
      }
    }

    // A few strays wandering the meadow so the middle isn't empty.
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = 30 + Math.sqrt(rng()) * 78
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (this.world.heightAt(x, z) < 0.8) continue
      const kind = rng.pick(['cow', 'sheep', 'calf', 'chicken'])
      this._add(new CritterEntity(kind, x, z, rng), { type: 'critter', kind, zone: 'meadow' })
    }

    step('Hiring the extras…')

    // People, themed per district.
    const roster = {
      farm: ['farmer', 'farmer', 'farmer', 'vet', 'rambler'],
      medical: ['doctor', 'nurse', 'nurse', 'patient', 'patient', 'patient'],
      pirate: ['pirate', 'pirate', 'pirate', 'captain'],
      wilds: ['rambler', 'rambler', 'vet'],
    }
    for (const zn of ZONES) {
      const kinds = roster[zn.id] ?? ['rambler']
      for (let i = 0; i < (zn.npcs ?? 0); i++) {
        const a = rng.range(0, Math.PI * 2)
        const r = Math.sqrt(rng()) * zn.radius * 0.7
        const x = zn.at[0] + Math.cos(a) * r
        const z = zn.at[1] + Math.sin(a) * r
        if (this.world.heightAt(x, z) < 0.9) continue
        const hk = rng.pick(kinds)
        this._add(new HumanEntity(hk, x, z, rng), { type: 'human', kind: hk, zone: zn.id })
      }
    }

    // Loose loot: food, barrels and chests are all fair game.
    /* Loot is comically oversized on purpose — a pizza the size of a cow is
       funnier than a realistic one, but it still needs a defined width so
       every kit lands at the same scale. */
    const loot = [
      ['assets/food/pizza.glb', 'Pizza', '🍕', 70, 2.2],
      ['assets/food/burger.glb', 'Burger', '🍔', 60, 1.8],
      ['assets/food/cake-birthday.glb', 'Birthday Cake', '🎂', 130, 2.0],
      ['assets/food/donut-sprinkles.glb', 'Donut', '🍩', 50, 1.6],
      ['assets/food/hot-dog.glb', 'Hot Dog', '🌭', 55, 1.8],
      ['assets/food/ice-cream.glb', 'Ice Cream', '🍦', 65, 1.4],
      ['assets/food/watermelon.glb', 'Watermelon', '🍉', 80, 1.6],
      ['assets/food/turkey.glb', 'Roast Turkey', '🍗', 110, 1.8],
      ['assets/pirate/chest.glb', 'Treasure Chest', '💰', 300, 2.0],
      ['assets/pirate/barrel.glb', 'Barrel', '🛢️', 45, 1.3],
      ['assets/pirate/cannon-ball.glb', 'Cannonball', '⚫', 35, 0.9],
    ]
    for (const [path, label, icon, points, size] of loot) {
      const g = await assets.glb(path)
      if (!g) continue
      const n = points > 200 ? 6 : 12
      for (let i = 0; i < n; i++) {
        const zn = rng.pick(ZONES)
        const a = rng.range(0, Math.PI * 2)
        const r = Math.sqrt(rng()) * zn.radius * 0.8
        const x = zn.at[0] + Math.cos(a) * r
        const z = zn.at[1] + Math.sin(a) * r
        if (this.world.heightAt(x, z) < 0.8) continue
        this._propScenes.set(path, g.scene)
        const m = g.scene.clone(true)
        fitToWidth(m, size)
        this._add(new PropEntity(m, x, z, {
          label, icon, points, radius: size, mass: 0.8 + size * 0.4,
        }), { type: 'prop', path, label, icon, points, size, zone: zn.id })
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
   * The world has to keep restocking or a determined seven-year-old strips it
   * bare in ten minutes and the game quietly ends. Anything abducted comes
   * back somewhere else in its own district after a short delay, so the map
   * stays alive without ever spawning something on top of the player.
   */
  _queueRespawn(e) {
    const spec = e.spawnSpec
    if (!spec) return
    this.respawns.push({ spec, at: this.t + 18 + this.rng() * 22 })
  }

  _drainRespawns() {
    if (!this.respawns.length) return
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]
      if (this.t < r.at) continue
      this.respawns.splice(i, 1)
      const born = this._spawnFromSpec(r.spec)
      if (born) this.burst(born.root.position.clone().setY(born.root.position.y + 1), 0x9dffbe, 8, 3)
    }
  }

  _spawnFromSpec(spec) {
    const rng = this.rng
    const zn = spec.zone === 'meadow' ? MEADOW_ZONE : ZONES.find((z) => z.id === spec.zone)
    // Try a few times for a spot that is on land and not under the saucer.
    for (let tries = 0; tries < 24; tries++) {
      const a = rng.range(0, Math.PI * 2)
      const r = Math.sqrt(rng()) * (zn ? zn.radius * 0.82 : 100)
      const x = (zn ? zn.at[0] : 0) + Math.cos(a) * r
      const z = (zn ? zn.at[1] : 0) + Math.sin(a) * r
      if (this.world.heightAt(x, z) < 1.2) continue
      if (Math.hypot(x - this.ufo.pos.x, z - this.ufo.pos.z) < 60) continue

      if (spec.type === 'critter') {
        return this._add(new CritterEntity(spec.kind, x, z, rng, { golden: spec.golden }), spec)
      }
      if (spec.type === 'human') {
        return this._add(new HumanEntity(spec.kind, x, z, rng), spec)
      }
      if (spec.type === 'prop') {
        const g = assets.cache.get(spec.path)
        const scene = g?.scene ?? this._propScenes?.get(spec.path)
        if (!scene) return null
        const m = scene.clone(true)
        fitToWidth(m, spec.size)
        return this._add(new PropEntity(m, x, z, {
          label: spec.label, icon: spec.icon, points: spec.points,
          radius: spec.size, mass: 0.8 + spec.size * 0.4,
        }), spec)
      }
      return null
    }
    // Couldn't place it this time; try again shortly.
    this.respawns.push({ spec, at: this.t + 6 })
    return null
  }

  /* ══ audio ═══════════════════════════════════════════════════════ */

  async _loadAudio() {
    audio.unlock()
    const files = {
      [SFX.beam]: 'assets/audio/sfx/forceField_002.ogg',
      [SFX.beamStart]: 'assets/audio/sfx/forceField_000.ogg',
      [SFX.collect]: 'assets/audio/sfx/laserSmall_000.ogg',
      [SFX.collectBig]: 'assets/audio/sfx/laserRetro_000.ogg',
      [SFX.combo]: 'assets/audio/sfx/computerNoise_001.ogg',
      [SFX.boost]: 'assets/audio/sfx/thrusterFire_000.ogg',
      [SFX.drop]: 'assets/audio/sfx/impactMetal_000.ogg',
      [SFX.engine]: 'assets/audio/sfx/spaceEngineLow_000.ogg',
      [SFX.full]: 'assets/audio/sfx/computerNoise_002.ogg',
      [SFX.deposit]: 'assets/audio/sfx/doorOpen_000.ogg',
      'cow-moo': 'assets/audio/sfx/cow-moo.wav',
      slime_000: 'assets/audio/sfx/slime_000.ogg',
      slime_002: 'assets/audio/sfx/slime_000.ogg',
    }
    await Promise.all(Object.entries(files).map(([k, p]) => audio.load(k, p)))
    this.beamHum = audio.loop(SFX.beam, { volume: 0.55, rate: 0.85 })
    this.engineHum = audio.loop(SFX.engine, { volume: 0.3, rate: 1 })
  }

  /* ══ particles ═══════════════════════════════════════════════════ */

  _particles() {
    const N = 240
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 1.5, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    this.sparkles = new THREE.Points(geo, mat)
    this.sparkles.frustumCulled = false
    this.scene.add(this.sparkles)
    this._pool = Array.from({ length: N }, () => ({
      life: 0, vel: new THREE.Vector3(), pos: new THREE.Vector3(), col: new THREE.Color(),
    }))
    this._pNext = 0
  }

  burst(at, color = 0xffe066, n = 18, spread = 5) {
    for (let i = 0; i < n; i++) {
      const p = this._pool[this._pNext = (this._pNext + 1) % this._pool.length]
      p.life = 0.75 + Math.random() * 0.5
      p.maxLife = p.life
      p.pos.copy(at)
      p.vel.set((Math.random() - 0.5) * spread, Math.random() * spread * 1.1 + 1.5,
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
        p.vel.y -= 13 * dt
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
    this.running = true
    this.last = performance.now()
    this._frame = this._frame.bind(this)
    requestAnimationFrame(this._frame)
  }

  pause(on) {
    this.paused = on
    audio.duckMusic(on)
    if (on) this.input.releaseAll()
    if (!on) this.last = performance.now()
  }

  _frame(now) {
    if (!this.running) return
    requestAnimationFrame(this._frame)
    let dt = (now - this.last) / 1000
    this.last = now
    if (this.paused) { this.renderer.render(this.scene, this.camera); return }
    dt = Math.min(dt, 1 / 20)                 // never let a stall teleport things
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()
  }

  update(dt) {
    // The simulation owns its own clock so a fixed-step caller (the headless
    // playtest) advances time exactly like the render loop does.
    this.t += dt
    const { input, ufo, world } = this
    input.poll()

    const wasBeaming = ufo.beamOn
    ufo.update(dt, input, world, this.t)
    if (ufo.beamOn && !wasBeaming) audio.play(SFX.beamStart, { volume: 0.5 })
    this.beamHum?.set(ufo.beamPower * 0.9)
    this.engineHum?.set(0.18 + Math.hypot(ufo.vel.x, ufo.vel.z) / 90 + ufo.boost * 0.4)

    if (input.consume('boost')) audio.play(SFX.boost, { volume: 0.5 })
    if (input.consume('moo')) this._moo()
    if (input.consume('drop')) this._drop()

    /* ── entities: only tick what's nearby ──────────────────────── */
    const ctx = { world, ufo, t: this.t, audio }
    const px = ufo.pos.x, pz = ufo.pos.z
    for (const e of this.entities) {
      if (e.state === STATE.DONE) continue
      const d = Math.hypot(e.root.position.x - px, e.root.position.z - pz)
      e.root.visible = d < 240
      // Distant animals still drift so the world feels alive, just cheaply.
      if (d > 165) continue
      e.update(dt, ctx)
      if (e.collected) this._collect(e)
    }

    /* ── combo decay ────────────────────────────────────────────── */
    if (this.combo > 1) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) { this.combo = 1; this.comboTimer = 0 }
      this.hud.setCombo(this.combo, this.comboTimer / this.comboWindow)
    } else {
      this.hud.setCombo(1, 0)
    }

    this._drainRespawns()
    this._updateParticles(dt)
    this._camera(dt)
    this._zoneWatch()
    this.minimap.draw(ufo, dt)
  }

  /* ══ actions ═════════════════════════════════════════════════════ */

  _moo() {
    audio.play(SFX.moo, { volume: 0.85, rate: 0.7, jitter: 0.05 })
    this.stats.mooCount++
    this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 3), 0xff9ecb, 14, 7)
    // A big daft moo makes everything nearby stop and stare, then bolt.
    for (const e of this.entities) {
      if (e.state === STATE.DONE) continue
      const d = Math.hypot(e.root.position.x - this.ufo.pos.x, e.root.position.z - this.ufo.pos.z)
      if (d < 52) {
        e.panic = 1
        e.state = 2 // FLEE
        e.think = 0
      }
    }
    this.hud.popup('MOOOO!', innerWidth / 2, innerHeight * 0.62, true)
  }

  _drop() {
    if (!this.cargo.length) return
    const item = this.cargo.pop()
    audio.play(SFX.drop, { volume: 0.6 })
    this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 4), 0x9dd6ff, 12, 6)
    this.hud.setCargo(this.cargo.map((c) => c.icon))
    this.hud.popup(`dropped ${item.icon}`, innerWidth / 2, innerHeight * 0.58, true)
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

    this.cargo.push({ icon: e.icon, label: e.label })
    if (this.cargo.length > this.cargoMax) this.cargo.shift()
    this.hud.setCargo(this.cargo.map((c) => c.icon))
    this.hud.setScore(this.score)
    this._paintRank()

    const big = e.points >= 200
    if (e.golden) {
      this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 3), 0xffd23f, 60, 12)
      this.shake = 1
    }
    audio.play(big ? SFX.collectBig : SFX.collect, {
      volume: big ? 0.75 : 0.5, rate: 1 + this.combo * 0.06, throttle: 0.02,
    })
    if (this.combo > 2) audio.play(SFX.combo, { volume: 0.35, rate: 1 + this.combo * 0.1 })

    this.burst(this.ufo.pos.clone().setY(this.ufo.pos.y - 3),
      big ? 0xffd23f : 0x9dffbe, big ? 34 : 18, big ? 8 : 5)
    this.shake = Math.min(1, this.shake + (big ? 0.55 : 0.24))

    // Project the saucer to screen space for the floating score.
    this._tmpV.copy(this.ufo.pos).project(this.camera)
    const sx = (this._tmpV.x * 0.5 + 0.5) * innerWidth
    const sy = (-this._tmpV.y * 0.5 + 0.5) * innerHeight
    this.hud.popup(`+${gained.toLocaleString()}`, sx, sy)
    this.hud.popup(`${e.icon} ${e.label}${mult > 1 ? `  x${mult}` : ''}`, sx, sy + 34, true)

    this._queueRespawn(e)
    // Retire the entity's resources after a beat, and drop it from the list
    // so the update loop doesn't walk an ever-growing array of corpses.
    setTimeout(() => {
      e.dispose()
      const i = this.entities.indexOf(e)
      if (i >= 0) this.entities.splice(i, 1)
    }, 60)
  }

  /* ══ camera & zones ══════════════════════════════════════════════ */

  _camera(dt) {
    const u = this.ufo.pos
    // Classic 3/4 view: high and behind, angled ~52° down.
    const back = 44, up = 54
    const lead = 0.55                      // look slightly ahead of travel
    const tx = u.x + this.ufo.vel.x * lead
    const tz = u.z + this.ufo.vel.z * lead
    const want = new THREE.Vector3(tx, u.y + up, tz + back)

    this.camRig.position.lerp(want, Math.min(1, dt * 3.4))

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.2)
      const s = this.shake * this.shake * 1.5
      this.camRig.position.x += (Math.random() - 0.5) * s
      this.camRig.position.y += (Math.random() - 0.5) * s
      this.camRig.position.z += (Math.random() - 0.5) * s
    }

    this.camera.position.copy(this.camRig.position)
    this.camera.lookAt(u.x, u.y - 12, u.z)

    // Keep the shadow frustum centred on the action.
    this.sun.position.set(u.x + 80, u.y + 130, u.z + 60)
    this.sun.target.position.set(u.x, 0, u.z)
    this.sun.target.updateMatrixWorld()
  }

  _zoneWatch() {
    const { zone, weight } = zoneAt(this.ufo.pos.x, this.ufo.pos.z)
    const active = weight > 0.06 ? zone : MEADOW
    if (active.id !== this._zoneId) {
      this._zoneId = active.id
      this.hud.setZone(active.name)
      if (active.music) audio.playMusic(active.music, { volume: 0.32 })
    }
  }

  _resize() {
    const w = innerWidth, h = innerHeight
    this.camera.aspect = w / h
    // Widen the field of view on tall phones so you still see the ground.
    this.camera.fov = h > w ? 62 : 52
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  }
}
