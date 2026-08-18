/** Thin wrapper over the DOM HUD so the game loop never touches elements. */
export class Hud {
  constructor() {
    this.el = {
      score: document.getElementById('score'),
      combo: document.getElementById('combo'),
      combox: document.getElementById('combox'),
      fuse: document.getElementById('combofuse'),
      zone: document.getElementById('zonename'),
      cargo: document.getElementById('cargo'),
      popups: document.getElementById('popups'),
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
        if (s.textContent !== it) { s.textContent = it; s.classList.remove('full') }
        // Re-trigger the pop animation on change.
        if (!s.classList.contains('full')) {
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

  setCombo(mult, frac) {
    if (mult <= 1) { this.el.combo.classList.add('hidden'); return }
    this.el.combo.classList.remove('hidden')
    this.el.combox.textContent = `x${mult}`
    this.el.fuse.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`
  }

  setZone(name) {
    if (this.el.zone.textContent === name) return
    this.el.zone.textContent = name
  }

  /** Floating "+100 Cow!" text at a screen position. */
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
