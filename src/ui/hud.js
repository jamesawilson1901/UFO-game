/** Thin wrapper over the DOM HUD so the game loop never touches elements. */
export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id)
    this.el = {
      score: $('score'), combo: $('combo'), combox: $('combox'), fuse: $('combofuse'),
      zone: $('zonename'), cargo: $('cargo'), popups: $('popups'),
      time: $('time'), timePill: $('timepill'), toast: $('toast'),
      alert: $('alert'), rank: $('rankname'), rankBar: $('rankbar'),
    }
    this._shown = 0
    this._slots = []
    this.setCargoSize(8)
  }

  setCargoSize(n) {
    this.el.cargo.innerHTML = ''
    this._slots = []
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i')
      this.el.cargo.appendChild(s)
      this._slots.push(s)
    }
  }

  setCargo(items) {
    for (let i = 0; i < this._slots.length; i++) {
      const it = items[i]
      const s = this._slots[i]
      if (it) {
        if (s.textContent !== it) {
          s.textContent = it
          s.classList.add('full')
          s.style.animation = 'none'
          void s.offsetWidth
          s.style.animation = ''
        }
      } else {
        s.textContent = ''
        s.classList.remove('full')
      }
    }
  }

  /** Counts up rather than snapping — makes every pickup feel bigger. */
  setScore(target) {
    this._target = target
    if (this._raf) return
    const step = () => {
      const d = this._target - this._shown
      if (Math.abs(d) < 1) {
        this._shown = this._target
        this.el.score.textContent = this._shown.toLocaleString()
        this._raf = null
        return
      }
      this._shown += d * 0.22
      this.el.score.textContent = Math.round(this._shown).toLocaleString()
      this._raf = requestAnimationFrame(step)
    }
    this._raf = requestAnimationFrame(step)
  }

  setTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds))
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    if (this.el.time.textContent !== txt) this.el.time.textContent = txt
    this.el.timePill.classList.toggle('low', s <= 30)
  }

  pulseTime() {
    const el = this.el.timePill
    el.classList.remove('tick')
    void el.offsetWidth
    el.classList.add('tick')
  }

  setCombo(mult, frac) {
    if (mult <= 1) { this.el.combo.classList.add('hidden'); return }
    this.el.combo.classList.remove('hidden')
    this.el.combox.textContent = `x${mult}`
    this.el.fuse.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`
  }

  setZone(name) { this.el.zone.textContent = name }

  setRank(name, frac) {
    if (this.el.rank.textContent !== name) this.el.rank.textContent = name
    this.el.rankBar.style.width = `${Math.round(frac * 100)}%`
  }

  /** A persistent banner (e.g. rival incoming). Empty string clears it. */
  setAlert(text) {
    this.el.alert.textContent = text
    this.el.alert.classList.toggle('hidden', !text)
  }

  /** A short centre-screen message. */
  toast(text, color) {
    const el = this.el.toast
    el.textContent = text
    if (color) el.style.color = `#${color.toString(16).padStart(6, '0')}`
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    clearTimeout(this._toastT)
    this._toastT = setTimeout(() => el.classList.remove('show'), 1800)
  }

  popup(text, x, y, small = false) {
    const d = document.createElement('div')
    d.className = small ? 'popup small' : 'popup'
    d.textContent = text
    d.style.left = `${x}px`
    d.style.top = `${y}px`
    this.el.popups.appendChild(d)
    setTimeout(() => d.remove(), 1250)
  }
}
