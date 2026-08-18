import { url } from './assets.js'

/**
 * WebAudio wrapper. Everything is lazy and forgiving: a missing file just
 * goes quiet rather than throwing, and the context is unlocked on the first
 * user gesture so iOS behaves.
 */
export class AudioBus {
  constructor() {
    this.ctx = null
    this.buffers = new Map()
    this.musicEl = null
    this.musicOn = true
    this.sfxOn = true
    this._pending = new Map()
    this._lastPlay = new Map()
    this._currentTrack = null
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 0.85
      this.sfxGain.connect(this.master)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  async load(name, path) {
    if (this.buffers.has(name)) return this.buffers.get(name)
    if (this._pending.has(name)) return this._pending.get(name)
    const p = fetch(url(path))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((buf) => { this.buffers.set(name, buf); return buf })
      .catch((e) => { console.warn('[audio] missing', path, e.message); this.buffers.set(name, null); return null })
    this._pending.set(name, p)
    return p
  }

  /**
   * @param {object} o  rate/detune jitter keeps repeated sounds from
   *                    turning into a machine-gun; `throttle` rate-limits.
   */
  play(name, { volume = 1, rate = 1, jitter = 0.08, throttle = 0, pan = 0 } = {}) {
    if (!this.sfxOn || !this.ctx) return null
    const buf = this.buffers.get(name)
    if (!buf) return null
    const now = this.ctx.currentTime
    if (throttle) {
      const last = this._lastPlay.get(name) ?? -1e9
      if (now - last < throttle) return null
      this._lastPlay.set(name, now)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter)
    const g = this.ctx.createGain()
    g.gain.value = volume
    let node = src
    node.connect(g)
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      g.connect(p); p.connect(this.sfxGain)
    } else {
      g.connect(this.sfxGain)
    }
    src.start()
    return { src, gain: g }
  }

  /** A held sound (the beam hum) that fades in and out. */
  loop(name, { volume = 0.5, rate = 1 } = {}) {
    if (!this.ctx) return null
    const buf = this.buffers.get(name)
    if (!buf) return null
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = 0
    src.connect(g); g.connect(this.sfxGain)
    src.start()
    const handle = {
      src, gain: g,
      set(v, t = 0.12) {
        if (!this.src) return
        const now = handle._ctx.currentTime
        g.gain.cancelScheduledValues(now)
        g.gain.setTargetAtTime(this.sfxOn === false ? 0 : v * volume, now, t)
      },
      stop() {
        if (!this.src) return
        try { src.stop(handle._ctx.currentTime + 0.2) } catch {}
        this.src = null
      },
      _ctx: this.ctx,
    }
    return handle
  }

  /** Music runs through an <audio> element — cheap streaming, easy looping. */
  playMusic(path, { volume = 0.34 } = {}) {
    if (this._currentTrack === path) return
    this._currentTrack = path
    if (this.musicEl) { this._fadeOutAndStop(this.musicEl) }
    const el = new Audio(url(path))
    el.loop = true
    el.volume = 0
    el.preload = 'auto'
    this.musicEl = el
    this._targetMusicVol = volume
    if (this.musicOn) {
      el.play().then(() => this._fadeTo(el, volume, 1200)).catch(() => {})
    }
  }

  _fadeTo(el, target, ms) {
    const start = el.volume
    const t0 = performance.now()
    const step = () => {
      if (this.musicEl !== el && target > 0) return
      const k = Math.min(1, (performance.now() - t0) / ms)
      el.volume = Math.max(0, Math.min(1, start + (target - start) * k))
      if (k < 1) requestAnimationFrame(step)
    }
    step()
  }

  _fadeOutAndStop(el) {
    this._fadeTo(el, 0, 700)
    setTimeout(() => { try { el.pause() } catch {} }, 760)
  }

  setMusic(on) {
    this.musicOn = on
    if (!this.musicEl) return
    if (on) { this.musicEl.play().catch(() => {}); this._fadeTo(this.musicEl, this._targetMusicVol ?? 0.34, 500) }
    else { this._fadeTo(this.musicEl, 0, 300); setTimeout(() => this.musicEl?.pause(), 340) }
  }

  setSfx(on) {
    this.sfxOn = on
    if (this.sfxGain) this.sfxGain.gain.value = on ? 0.85 : 0
  }

  duckMusic(on) {
    if (!this.musicEl || !this.musicOn) return
    this._fadeTo(this.musicEl, on ? (this._targetMusicVol ?? 0.34) * 0.3 : (this._targetMusicVol ?? 0.34), 300)
  }
}

export const audio = new AudioBus()
