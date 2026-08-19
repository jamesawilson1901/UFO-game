/**
 * The joystick is the whole left third now, so this checks a thumb landing
 * in several different places all produce a working stick — including the
 * far corners a child will actually hit.
 */
import { chromium, devices } from 'playwright'
const URL_ = process.argv[2] ?? 'http://localhost:4195/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const ctx = await b.newContext({ ...devices['iPad (gen 7) landscape'], hasTouch: true, isMobile: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(URL_, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 300000 })
await p.tap('#playbtn')
await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 300000 })
await p.tap('#gobtn')
await p.waitForTimeout(700)

const client = await p.context().newCDPSession(p)
const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points })
const vp = p.viewportSize()
const zone = await p.evaluate(() => {
  const r = document.getElementById('stick').getBoundingClientRect()
  return { w: r.width, h: r.height }
})
console.log(`zone: ${Math.round(zone.w)}x${Math.round(zone.h)} of ${vp.width}x${vp.height} ` +
  `(${Math.round(zone.w / vp.width * 100)}% of screen width)`)

let allOk = true
const spots = [
  ['top-left corner', 40, 60],
  ['middle of zone', zone.w * 0.5, zone.h * 0.5],
  ['bottom-left (natural)', 90, zone.h - 80],
  ['top of zone', zone.w * 0.6, 40],
  ['right edge of zone', zone.w - 20, zone.h * 0.6],
]
for (const [name, sx, sy] of spots) {
  await touch('touchStart', [{ x: sx, y: sy, id: 1 }])
  await p.waitForTimeout(60)
  // push right and up
  await touch('touchMove', [{ x: sx + 70, y: sy - 70, id: 1 }])
  await p.waitForTimeout(90)
  const m = await p.evaluate(() => ({
    x: +window.game.input.move.x.toFixed(2),
    y: +window.game.input.move.y.toFixed(2),
    padVisible: getComputedStyle(document.getElementById('stickpad')).opacity,
  }))
  await touch('touchEnd', [])
  await p.waitForTimeout(80)
  const released = await p.evaluate(() => window.game.input.move.x === 0)
  const ok = m.x > 0.4 && m.y > 0.4 && released
  if (!ok) allOk = false
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(22)} move=(${m.x}, ${m.y}) opacity=${m.padVisible} released=${released}`)
}

// stick + both buttons at once
const beam = await p.locator('.pad-a').boundingBox()
const laser = await p.locator('.pad-b').boundingBox()
await touch('touchStart', [{ x: 120, y: zone.h - 100, id: 1 }])
await touch('touchStart', [
  { x: 120, y: zone.h - 100, id: 1 },
  { x: beam.x + beam.width/2, y: beam.y + beam.height/2, id: 2 },
  { x: laser.x + laser.width/2, y: laser.y + laser.height/2, id: 3 },
])
await p.waitForTimeout(120)
const multi = await p.evaluate(() => ({
  beam: window.game.input.buttons.beam, laser: window.game.input.buttons.laser,
}))
await touch('touchEnd', [])
console.log(`  ${multi.beam && multi.laser ? '✓' : '✗'} stick + beam + laser together`)

const sizes = await p.evaluate(() => {
  const a = document.querySelector('.pad-a').getBoundingClientRect()
  const x = document.querySelector('.pad-x').getBoundingClientRect()
  return { beamBtn: Math.round(a.width), otherBtn: Math.round(x.width) }
})
console.log(`  button sizes: beam ${sizes.beamBtn}px, others ${sizes.otherBtn}px`)
console.log(allOk && multi.beam && multi.laser ? '\n✓ joystick works from anywhere in the left third'
  : '\n✗ FAILED')
if (errs.length) console.log('errors:', [...new Set(errs)].slice(0,3))
await b.close()
process.exit(allOk && !errs.length ? 0 : 1)
