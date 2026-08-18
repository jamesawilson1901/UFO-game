/**
 * Boots every theme in turn and exercises a round: beam, laser, moo, the
 * rival, and the end-of-round handoff. Steps game.update() at a fixed rate
 * because the headless renderer runs at ~1fps under SwiftShader.
 */
import { chromium } from 'playwright'

const URL_ = process.argv[2] ?? 'http://localhost:4175/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
p.on('pageerror', e => errs.push(`${e.message}\n  ${(e.stack||'').split('\n')[1]?.trim() ?? ''}`))
p.on('console', m => { if (m.type()==='error' && !/ERR_ABORTED|Failed to load resource/.test(m.text())) errs.push(m.text()) })

await p.goto(URL_, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 240000 })
console.log('✓ engine booted')

const themes = await p.evaluate(() => window.game.constructor && null)
const ids = await p.evaluate(async () => {
  const m = await import('./src/world/themes.js').catch(() => null)
  return null
})

// Drive each theme by forcing pickTheme to walk the list.
const total = await p.evaluate(() => window.game.playedThemes && 0)
const themeIds = await p.evaluate(() => {
  // themes are bundled; reach them through the game's own picker
  const seen = []
  for (let i = 0; i < 30; i++) { const t = window.game.pickTheme(); if (!seen.includes(t.id)) seen.push(t.id) }
  window.game.playedThemes = []
  return seen
})
console.log('themes found:', themeIds.join(', '))

await p.click('#playbtn')

for (let i = 0; i < themeIds.length; i++) {
  await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 240000 })
  const name = await p.textContent('#introname')
  await p.click('#gobtn')
  await p.waitForTimeout(400)

  const r = await p.evaluate(() => {
    const g = window.game
    g.paused = true
    const out = { world: g.theme.id, entities: g.entities.length }

    // 1. beam a run of targets
    g.input.buttons.beam = true
    for (let n = 0; n < 12; n++) {
      const live = g.entities.filter(e => e.state !== 4)
      if (!live.length) break
      const e = live[(n * 7919) % live.length]
      g.ufo.pos.set(e.root.position.x, e.root.position.y + 24, e.root.position.z)
      g.ufo.vel.set(0,0,0)
      for (let k = 0; k < 150; k++) g.update(1/60)
    }
    out.afterBeam = g.score
    out.abducted = g.stats.abducted
    g.input.buttons.beam = false

    // 2. lasers: vaporise and stun
    g.input.buttons.laser = true
    for (let n = 0; n < 6; n++) {
      const live = g.entities.filter(e => e.state !== 4)
      if (!live.length) break
      const e = live[(n * 104729) % live.length]
      g.ufo.pos.set(e.root.position.x, e.root.position.y + 24, e.root.position.z)
      for (let k = 0; k < 90; k++) g.update(1/60)
    }
    out.vaporised = g.stats.vaporised
    out.stunned = g.entities.filter(e => e.stun > 0).length
    g.input.buttons.laser = false

    // 3. moo
    g._moo()

    // 4. force the rival in, let it ram and steal, then shoot it down
    g.nextRivalAt = 0
    g.t += 1
    for (let k = 0; k < 60 * 25; k++) g.update(1/60)
    out.rivalSpawned = g.rival.alive || g.stats.rivalsDowned > 0 || g.stats.stolen > 0
    out.rivalState = g.rival.state
    out.dropped = g.dropped.length
    if (g.rival.alive) {
      for (let h = 0; h < 8; h++) g.rival.hit(1)
      for (let k = 0; k < 60 * 4; k++) g.update(1/60)
    }
    out.rivalsDowned = g.stats.rivalsDowned

    // 5. run out the clock
    g.timeLeft = 1.5
    for (let k = 0; k < 60 * 3 && !g.ended; k++) g.update(1/60)
    out.ended = g.ended
    out.finalScore = g.score
    out.calls = g.renderer.info.render.calls
    return out
  })
  console.log(`  ${String(i+1).padStart(2)}. ${name.padEnd(24)} ` +
    `ents=${String(r.entities).padStart(3)} score=${String(r.finalScore).padStart(6)} ` +
    `beamed=${String(r.abducted).padStart(2)} vapd=${String(r.vaporised).padStart(2)} ` +
    `stun=${String(r.stunned).padStart(2)} rival=${r.rivalSpawned?'Y':'n'} ` +
    `downed=${r.rivalsDowned} ended=${r.ended?'Y':'n'}`)

  await p.waitForSelector('#results:not(.hidden)', { timeout: 30000 })
  if (i < themeIds.length - 1) await p.click('#againbtn')
}

console.log(errs.length ? `\n✗ ${errs.length} error(s):\n` + [...new Set(errs)].slice(0,10).join('\n')
  : '\n✓ no errors across all themes')
await b.close()
process.exit(errs.length ? 1 : 0)
