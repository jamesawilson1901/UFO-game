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
  Space: 'beam', KeyF: 'laser', Enter: 'laser',
  ShiftLeft: 'boost', ShiftRight: 'boost', KeyQ: 'moo',
}

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 }          // -1..1, y is "forward" (screen up)
    this.buttons = { beam: false, laser: false, boost: false, moo: false }
    this._justPressed = new Set()
    this._keys = new Set()
    this._stickId = null
    this._padIds = new Map()            // pointerId -> action
    this.enabled = false
  }

  attach() {
    this.stick = document.getElementById('stick')
    this.pad = document.getElementById('stickpad')
    this.nub = document.getElementById('nub')
    this.padEls = [...document.querySelectorAll('.pad')]

    /* ── analogue stick ───────────────────────────────────────────
       The zone is the left third of the screen; the visible pad jumps to
       wherever the thumb goes down and the vector is measured from there.
       Resting, it sits back in the bottom-left corner so it still reads as
       "the thing you drive with". */
    const radius = () => this.pad.clientWidth * 0.42

    const setNub = (dx, dy) => {
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`
    }

    const placePad = (clientX, clientY) => {
      const zone = this.stick.getBoundingClientRect()
      const size = this.pad.offsetWidth
      // Keep the pad fully on screen even if the thumb lands at an edge.
      const x = Math.max(0, Math.min(zone.width - size, clientX - zone.left - size / 2))
      const y = Math.max(0, Math.min(zone.height - size, clientY - zone.top - size / 2))
      this.pad.style.transform = `translate(${x}px, ${y}px)`
    }

    const onStickDown = (e) => {
      if (this._stickId !== null) return
      this._stickId = e.pointerId
      this.stick.setPointerCapture(e.pointerId)
      this.stick.classList.add('active')
      this._stickOrigin = { x: e.clientX, y: e.clientY }
      placePad(e.clientX, e.clientY)
      setNub(0, 0)
    }

    const onStickMove = (e) => {
      if (e.pointerId !== this._stickId) return
      const o = this._stickOrigin
      const r = radius()
      const dx = e.clientX - o.x
      const dy = e.clientY - o.y
      const len = Math.hypot(dx, dy)
      // Small dead zone stops jitter from a resting thumb.
      const dead = r * 0.1
      if (len < dead) { this.move.x = 0; this.move.y = 0; setNub(dx, dy); return }

      const clamped = Math.min(len, r)
      setNub((dx / len) * clamped, (dy / len) * clamped)
      // Re-normalise past the dead zone so the first responsive pixel is 0.
      const mag = (clamped - dead) / (r - dead)
      this.move.x = (dx / len) * mag
      this.move.y = (-dy / len) * mag

      /* Dragging beyond the pad drags the whole stick along, so a child who
         keeps pushing never runs out of travel and never loses the stick. */
      if (len > r) {
        o.x += dx - (dx / len) * r
        o.y += dy - (dy / len) * r
        placePad(o.x, o.y)
      }
    }

    const onStickUp = (e) => {
      if (e.pointerId !== this._stickId) return
      this._stickId = null
      this.stick.classList.remove('active')
      this.move.x = 0; this.move.y = 0
      setNub(0, 0)
      this.pad.style.transform = ''
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
    if (this.pad) this.pad.style.transform = ''
    this.stick?.classList.remove('active')
    this._stickId = null
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
        const gb = [['beam', 0], ['laser', 1], ['boost', 2], ['moo', 3]]
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
