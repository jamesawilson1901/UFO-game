/**
 * Touch-first input: an analogue stick on the left, four face buttons on the
 * right, both driven by pointer events so multi-touch works. Keyboard and
 * gamepad are layered on top for desktop testing.
 */
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'beam', ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyE: 'drop', KeyQ: 'moo',
}

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 }          // -1..1, y is "forward" (screen up)
    this.buttons = { beam: false, boost: false, drop: false, moo: false }
    this._justPressed = new Set()
    this._keys = new Set()
    this._stickId = null
    this._padIds = new Map()            // pointerId -> action
    this.enabled = false
  }

  attach() {
    this.stick = document.getElementById('stick')
    this.nub = document.getElementById('nub')
    this.padEls = [...document.querySelectorAll('.pad')]

    // ── analogue stick ────────────────────────────────────────────
    const radius = () => this.stick.clientWidth * 0.32

    const setNub = (dx, dy) => {
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`
    }

    const onStickDown = (e) => {
      if (this._stickId !== null) return
      this._stickId = e.pointerId
      this.stick.setPointerCapture(e.pointerId)
      this.stick.classList.add('active')
      this._stickOrigin = this._stickCentre(e)
      onStickMove(e)
    }

    const onStickMove = (e) => {
      if (e.pointerId !== this._stickId) return
      const o = this._stickOrigin
      const r = radius()
      let dx = e.clientX - o.x
      let dy = e.clientY - o.y
      const len = Math.hypot(dx, dy)
      // Small dead zone stops jitter from a resting thumb.
      const dead = r * 0.12
      if (len < dead) { this.move.x = 0; this.move.y = 0; setNub(dx, dy); return }
      const clamped = Math.min(len, r)
      const nx = (dx / len) * clamped
      const ny = (dy / len) * clamped
      setNub(nx, ny)
      // Re-normalise past the dead zone so the first responsive pixel is 0.
      const mag = (clamped - dead) / (r - dead)
      this.move.x = (dx / len) * mag
      this.move.y = (-dy / len) * mag
    }

    const onStickUp = (e) => {
      if (e.pointerId !== this._stickId) return
      this._stickId = null
      this.stick.classList.remove('active')
      this.move.x = 0; this.move.y = 0
      setNub(0, 0)
    }

    this.stick.addEventListener('pointerdown', onStickDown)
    this.stick.addEventListener('pointermove', onStickMove)
    this.stick.addEventListener('pointerup', onStickUp)
    this.stick.addEventListener('pointercancel', onStickUp)

    // ── face buttons ──────────────────────────────────────────────
    for (const el of this.padEls) {
      const act = el.dataset.act
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        el.setPointerCapture(e.pointerId)
        this._padIds.set(e.pointerId, act)
        this._press(act, el)
      })
      const release = (e) => {
        if (!this._padIds.has(e.pointerId)) return
        this._padIds.delete(e.pointerId)
        this._release(act, el)
      }
      el.addEventListener('pointerup', release)
      el.addEventListener('pointercancel', release)
      el.addEventListener('contextmenu', (e) => e.preventDefault())
    }

    // ── keyboard ──────────────────────────────────────────────────
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code]
      if (!a) return
      e.preventDefault()
      if (this._keys.has(e.code)) return
      this._keys.add(e.code)
      if (a in this.buttons) this._press(a, this._padFor(a))
    })
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code]
      if (!a) return
      this._keys.delete(e.code)
      if (a in this.buttons) this._release(a, this._padFor(a))
    })
    addEventListener('blur', () => this.releaseAll())
  }

  _padFor(act) { return this.padEls.find((p) => p.dataset.act === act) }

  _stickCentre(e) {
    // Anchor to where the thumb landed, not the pad centre — much nicer on
    // a tablet where you never look at your hands.
    const r = this.stick.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
    return dist < r.width * 0.28 ? { x: cx, y: cy } : { x: e.clientX, y: e.clientY }
  }

  _press(act, el) {
    if (!this.buttons[act]) this._justPressed.add(act)
    this.buttons[act] = true
    el?.classList.add('down')
  }

  _release(act, el) {
    this.buttons[act] = false
    el?.classList.remove('down')
  }

  releaseAll() {
    for (const k of Object.keys(this.buttons)) this._release(k, this._padFor(k))
    this._padIds.clear()
    this._keys.clear()
    this.move.x = 0; this.move.y = 0
    if (this.nub) this.nub.style.transform = 'translate(0,0)'
  }

  /** Merge keyboard arrows + gamepad stick into the analogue vector. */
  poll() {
    if (this._stickId === null) {
      let x = 0, y = 0
      if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) x -= 1
      if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) x += 1
      if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) y += 1
      if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) y -= 1
      const len = Math.hypot(x, y)
      if (len > 0) { x /= len; y /= len }
      this.move.x = x; this.move.y = y

      const gp = navigator.getGamepads?.()[0]
      if (gp) {
        const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0
        if (Math.hypot(ax, ay) > 0.18) { this.move.x = ax; this.move.y = -ay }
        const gb = [['beam', 0], ['boost', 1], ['drop', 2], ['moo', 3]]
        for (const [act, i] of gb) {
          const down = !!gp.buttons[i]?.pressed
          if (down && !this.buttons[act]) this._press(act, this._padFor(act))
          else if (!down && this.buttons[act] && !this._keys.size) this._release(act, this._padFor(act))
        }
      }
    }
  }

  /** True once per press. */
  consume(act) {
    if (this._justPressed.has(act)) { this._justPressed.delete(act); return true }
    return false
  }

  endFrame() { this._justPressed.clear() }
}
