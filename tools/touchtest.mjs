/** Verifies the on-screen controls respond to real touch input, including
 *  simultaneous stick + button (the thing that breaks with mouse-only code). */
import { chromium, devices } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const ctx = await b.newContext({ ...devices['iPad (gen 7) landscape'], hasTouch: true, isMobile: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(process.argv[2] ?? 'http://localhost:4173/', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 240000 })
await p.tap('#playbtn')
await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 240000 })
await p.tap('#gobtn')
await p.waitForTimeout(600)

const box = async (sel) => (await p.locator(sel).boundingBox())
const stick = await box('#stick')
const beam = await box('.pad-a')
const moo = await box('.pad-y')
const results = {}

// 1. Drag the stick and read the analogue vector.
const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2
await p.touchscreen.tap(cx, cy)  // warm up
const client = await p.context().newCDPSession(p)
const touch = async (type, points) =>
  client.send('Input.dispatchTouchEvent', { type, touchPoints: points })

await touch('touchStart', [{ x: cx, y: cy, id: 1 }])
await touch('touchMove', [{ x: cx + stick.width * 0.42, y: cy, id: 1 }])
await p.waitForTimeout(120)
results.stickRight = await p.evaluate(() => ({ x: +window.game.input.move.x.toFixed(2), y: +window.game.input.move.y.toFixed(2) }))

// 2. Press BEAM while still holding the stick — multi-touch.
await touch('touchStart', [
  { x: cx + stick.width * 0.42, y: cy, id: 1 },
  { x: beam.x + beam.width / 2, y: beam.y + beam.height / 2, id: 2 },
])
await p.waitForTimeout(120)
results.bothAtOnce = await p.evaluate(() => ({
  move: +window.game.input.move.x.toFixed(2),
  beam: window.game.input.buttons.beam,
}))

// 3. Third finger on MOO.
await touch('touchStart', [
  { x: cx + stick.width * 0.42, y: cy, id: 1 },
  { x: beam.x + beam.width / 2, y: beam.y + beam.height / 2, id: 2 },
  { x: moo.x + moo.width / 2, y: moo.y + moo.height / 2, id: 3 },
])
await p.waitForTimeout(120)
results.threeFingers = await p.evaluate(() => ({
  move: +window.game.input.move.x.toFixed(2),
  beam: window.game.input.buttons.beam,
  moo: window.game.input.buttons.moo,
}))

// 4. Lift everything; the stick must recentre.
await touch('touchEnd', [])
await p.waitForTimeout(200)
results.released = await p.evaluate(() => ({
  move: window.game.input.move.x, beam: window.game.input.buttons.beam,
  moo: window.game.input.buttons.moo,
}))

console.log(JSON.stringify(results, null, 2))
const ok = results.stickRight.x > 0.5
  && results.bothAtOnce.beam && results.bothAtOnce.move > 0.5
  && results.threeFingers.moo && results.threeFingers.beam
  && results.released.move === 0 && !results.released.beam
console.log(ok ? '\n✓ multi-touch works' : '\n✗ multi-touch FAILED')
if (errs.length) console.log('errors:', errs.slice(0, 5))
await b.close()
process.exit(ok && !errs.length ? 0 : 1)
