import { WORLD_SIZE, WORLD_HALF } from '../world/themes.js'

/**
 * A sprawling world is only fun if you can find your way back to the cows.
 * The minimap is deliberately simple: four coloured districts, a dot for the
 * saucer, and a nose showing which way you're pointing. No labels, no clutter
 * — a five-year-old reads shape and colour, not text.
 */

export class Minimap {
  constructor(size = 132) {
    this.size = size
    const c = document.createElement('canvas')
    c.className = 'minimap'
    c.width = size * 2                 // 2x for crispness on retina
    c.height = size * 2
    c.style.width = `${size}px`
    c.style.height = `${size}px`
    document.getElementById('hud').appendChild(c)
    this.canvas = c
    this.ctx = c.getContext('2d')
    this._t = 0
  }

  /** World XZ -> canvas pixels. */
  _p(x, z) {
    const s = this.size * 2
    const k = s / WORLD_SIZE
    return [(x + WORLD_HALF) * k, (z + WORLD_HALF) * k]
  }

  /** Landmarks come from the world build, so the map suits any theme. */
  setLandmarks(list, groundColor) {
    this.landmarks = list ?? []
    this.ground = groundColor ?? 0x86bb51
  }

  draw(ufo, dt, rival = null) {
    this._t += dt
    const { ctx } = this
    const s = this.size * 2
    ctx.clearRect(0, 0, s, s)

    // Ground
    ctx.fillStyle = 'rgba(11,16,38,.72)'
    ctx.beginPath()
    ctx.roundRect(0, 0, s, s, 26)
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(0, 0, s, s, 26)
    ctx.clip()

    const g = this.ground ?? 0x86bb51
    ctx.fillStyle = `rgba(${(g >> 16) & 255},${(g >> 8) & 255},${g & 255},.42)`
    ctx.fillRect(0, 0, s, s)

    // Landmarks: small dots so the map reads as a place, not a blank square.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const l of this.landmarks ?? []) {
      const [x, y] = this._p(l.pos.x, l.pos.z)
      const big = l.kind === 'zone' || l.kind === 'landmark'
      ctx.fillStyle = big ? 'rgba(255,246,229,.85)' : 'rgba(255,246,229,.42)'
      ctx.beginPath()
      ctx.arc(x, y, big ? s * 0.018 : s * 0.011, 0, Math.PI * 2)
      ctx.fill()
    }

    // The saucer: a pulsing dot with a nose in the direction of travel.
    const [ux, uy] = this._p(ufo.pos.x, ufo.pos.z)
    const pulse = 1 + Math.sin(this._t * 5) * 0.15
    ctx.fillStyle = 'rgba(125,249,255,.28)'
    ctx.beginPath()
    ctx.arc(ux, uy, s * 0.075 * pulse, 0, Math.PI * 2)
    ctx.fill()

    // A dark halo first, so the marker stays legible over any district colour.
    ctx.fillStyle = 'rgba(11,16,38,.75)'
    ctx.beginPath()
    ctx.arc(ux, uy, s * 0.052, 0, Math.PI * 2)
    ctx.fill()

    const sp = Math.hypot(ufo.vel.x, ufo.vel.z)
    ctx.save()
    ctx.translate(ux, uy)
    if (sp > 1.5) ctx.rotate(-Math.atan2(ufo.vel.x, ufo.vel.z))
    ctx.fillStyle = '#7df9ff'
    ctx.strokeStyle = '#0b1026'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, -s * 0.058)
    ctx.lineTo(s * 0.036, s * 0.032)
    ctx.lineTo(0, s * 0.012)
    ctx.lineTo(-s * 0.036, s * 0.032)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // The rival, so you can see where the thief went.
    if (rival?.alive) {
      const [rx, ry] = this._p(rival.pos.x, rival.pos.z)
      ctx.fillStyle = 'rgba(11,16,38,.75)'
      ctx.beginPath(); ctx.arc(rx, ry, s * 0.05, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = Math.sin(this._t * 12) > 0 ? '#ff4d4d' : '#8dff6a'
      ctx.beginPath(); ctx.arc(rx, ry, s * 0.032, 0, Math.PI * 2); ctx.fill()
    }

    ctx.restore()

    ctx.strokeStyle = 'rgba(125,249,255,.35)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(2, 2, s - 4, s - 4, 26)
    ctx.stroke()
  }
}
