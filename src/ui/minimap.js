import { ZONES, WORLD } from '../world/zones.js'

/**
 * A sprawling world is only fun if you can find your way back to the cows.
 * The minimap is deliberately simple: four coloured districts, a dot for the
 * saucer, and a nose showing which way you're pointing. No labels, no clutter
 * — a five-year-old reads shape and colour, not text.
 */
const ZONE_COLOR = {
  farm: '#8ec751',
  medical: '#ff6b6b',
  pirate: '#e0c377',
  wilds: '#3f8f43',
}
const ZONE_ICON = { farm: '🐄', medical: '🏥', pirate: '🏴‍☠️', wilds: '🌲' }

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
    const k = s / WORLD.size
    return [(x + WORLD.half) * k, (z + WORLD.half) * k]
  }

  draw(ufo, dt) {
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

    ctx.fillStyle = 'rgba(134,187,81,.30)'
    ctx.fillRect(0, 0, s, s)

    // Districts
    for (const zn of ZONES) {
      const [x, y] = this._p(zn.at[0], zn.at[1])
      const r = (zn.radius / WORLD.size) * s
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
      g.addColorStop(0, `${ZONE_COLOR[zn.id]}dd`)
      g.addColorStop(1, `${ZONE_COLOR[zn.id]}00`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `${Math.round(s * 0.13)}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ZONE_ICON[zn.id] ?? '', x, y)
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

    ctx.restore()

    ctx.strokeStyle = 'rgba(125,249,255,.35)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(2, 2, s - 4, s - 4, 26)
    ctx.stroke()
  }
}
