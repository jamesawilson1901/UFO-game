/**
 * Fixed-step gameplay test. The headless renderer runs at ~1fps under
 * SwiftShader, and the loop clamps dt, so real-time play would take minutes of
 * wall clock to simulate seconds. Stepping game.update() directly exercises
 * the same code deterministically.
 */
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1200, height: 800 } })
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error' && !/404|ERR_ABORTED/.test(m.text())) errs.push(m.text()) })
await p.goto(process.argv[2] ?? 'http://localhost:4173/', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 240000 })
await p.click('#playbtn')
await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 240000 })
await p.click('#gobtn'); await p.waitForTimeout(400)

const r = await p.evaluate(() => {
  const g = window.game
  g.paused = true
  g.input.buttons.beam = true
  const log = []
  // Hunt 60 targets, preferring the nearest live one each time.
  for (let n = 0; n < 60; n++) {
    const live = g.entities.filter(e => e.state !== 4)
    if (!live.length) break
    const e = live[(n * 7919) % live.length]
    g.ufo.pos.set(e.root.position.x, e.root.position.y + 22, e.root.position.z)
    g.ufo.vel.set(0, 0, 0)
    const before = g.score
    for (let i = 0; i < 200; i++) g.update(1 / 60)
    if (g.score > before) log.push(`${e.label} +${g.score - before}`)
  }
  // Exercise the other actions.
  g._moo()
  // Let the world restock: 60 seconds of game time with nothing happening.
  g.input.buttons.beam = false
  const beforeRestock = g.entities.filter(e => e.state !== 4).length
  for (let i = 0; i < 60 * 60; i++) g.update(1 / 60)
  const afterRestock = g.entities.filter(e => e.state !== 4).length
  return {
    score: g.score, abducted: g.stats.abducted, combo: g.combo,
    rank: document.querySelector('.rank b')?.textContent,
    cargo: g.cargo.map(c => c.icon).join(''),
    caught: log.length, sample: log.slice(0, 8),
    kinds: Object.keys(g.stats.best).length,
    goldenTaken: Object.keys(g.stats.best).filter(k => k.startsWith('Golden')),
    remaining: g.entities.filter(e => e.state !== 4).length,
    restock: `${beforeRestock} -> ${afterRestock}`,
    pendingRespawns: g.respawns.length,
  }
})
console.log(JSON.stringify(r, null, 2))
console.log(errs.length ? `\n✗ ${errs.length} error(s):\n` + [...new Set(errs)].slice(0,8).join('\n') : '\n✓ no errors')
await b.close()
process.exit(errs.length ? 1 : 0)
