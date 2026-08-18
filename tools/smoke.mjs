/**
 * Headless smoke test: boots the game in a real browser, drives the controls
 * for a few seconds and reports console errors plus a screenshot.
 * Usage: node tools/smoke.mjs [url] [outfile] [seconds]
 */
import { chromium } from 'playwright'

const URL_ = process.argv[2] ?? 'http://localhost:4173/'
const OUT = process.argv[3] ?? '/tmp/shot.png'
const SECS = Number(process.argv[4] ?? 12)

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
const logs = []
page.on('console', (m) => {
  const t = `${m.type()}: ${m.text()}`
  logs.push(t)
  if (m.type() === 'error') errors.push(t)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${(e.stack||'').split('\n').slice(1,4).join('\n')}`))
page.on('requestfailed', (r) => errors.push(`404/failed: ${r.url().slice(-90)} ${r.failure()?.errorText ?? ''}`))

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 })

// Wait for boot to finish (the start screen becomes visible).
try {
  await page.waitForSelector('#start:not(.hidden)', { timeout: 120000 })
  console.log('✓ booted')
} catch {
  const tip = await page.textContent('#boottip').catch(() => '')
  console.log('✗ boot did not finish. tip text:', tip)
}

await page.click('#playbtn').catch(() => {})
await page.waitForTimeout(1200)

// Drive it: hold beam, wiggle the stick.
await page.evaluate(() => {
  const g = window.game
  if (!g) return
  g.input.buttons.beam = true
  let a = 0
  window.__drive = setInterval(() => {
    a += 0.16
    g.input.move.x = Math.cos(a)
    g.input.move.y = Math.sin(a * 0.7)
  }, 50)
})
await page.waitForTimeout(2500)

// Prove abduction works: park the saucer directly over live targets and hold
// the beam. Repeat across districts so each entity type gets exercised.
await page.evaluate(() => clearInterval(window.__drive))
const hunted = []
for (let i = 0; i < 8; i++) {
  const label = await page.evaluate(() => {
    const g = window.game
    g.input.move.x = 0; g.input.move.y = 0
    g.input.buttons.beam = true
    const live = g.entities.filter(e => e.state !== 4)
    if (!live.length) return null
    // Pick a target we have not just cleared out.
    const e = live[Math.floor(Math.random() * live.length)]
    g.ufo.pos.set(e.root.position.x, e.root.position.y + 24, e.root.position.z)
    g.ufo.vel.set(0, 0, 0)
    return e.label
  })
  hunted.push(label)
  await page.waitForTimeout(2000)
}
console.log('hunted:', hunted.filter(Boolean).join(', '))

// Tap the other three buttons.
for (const b of ['moo', 'drop', 'boost']) {
  await page.evaluate((k) => { window.game.input._justPressed.add(k); window.game.input.buttons[k] = true }, b)
  await page.waitForTimeout(500)
  await page.evaluate((k) => { window.game.input.buttons[k] = false }, b)
}

// Visit each district.
const zones = await page.evaluate(() => {
  const g = window.game
  return g ? g.world.landmarks.filter(l => l.kind === 'zone').map(l => ({ n: l.name, x: l.pos.x, z: l.pos.z })) : []
})
for (const z of zones) {
  await page.evaluate(({ x, z: zz }) => {
    window.game.ufo.pos.set(x, 32, zz + 20)
    window.game.ufo.vel.set(0, 0, 0)
  }, z)
  await page.waitForTimeout(1400)
}

const state = await page.evaluate(() => {
  const g = window.game
  if (!g) return null
  return {
    score: g.score,
    abducted: g.stats.abducted,
    entities: g.entities.length,
    alive: g.entities.filter(e => e.state !== 4).length,
    tris: g.renderer.info.render.triangles,
    calls: g.renderer.info.render.calls,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
    zone: document.getElementById('zonename')?.textContent,
    cargo: g.cargo.map(c => c.icon).join(''),
    combo: g.combo,
    kinds: Object.entries(g.stats.best).map(([k, v]) => `${k}:${v}`).join(' '),
    byType: (() => {
      const m = {}
      for (const e of g.entities) m[e.constructor.name] = (m[e.constructor.name] || 0) + 1
      return m
    })(),
    ufoY: Math.round(g.ufo.pos.y),
  }
})

await page.screenshot({ path: OUT })

console.log('\n── state ──'); console.log(JSON.stringify(state, null, 2))
if (errors.length) {
  console.log(`\n── ${errors.length} error(s) ──`)
  for (const e of [...new Set(errors)].slice(0, 25)) console.log(' •', e)
} else console.log('\n✓ no console errors')

await browser.close()
process.exit(errors.length ? 1 : 0)
