/**
 * Verifies the game installs and then runs with the network cut off.
 * The service worker is the only thing standing between "works on the sofa"
 * and "works on a plane", so this test actually goes offline.
 */
import { chromium } from 'playwright'
const URL_ = process.argv[2] ?? 'http://localhost:4192/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))

await p.goto(URL_, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 300000 })
await p.waitForSelector('#offlinebtn:not(.hidden)', { timeout: 60000 })
console.log('✓ service worker registered, offline button shown')
console.log('  button:', (await p.textContent('#offlinebtn')).trim())

// Download everything.
await p.click('#offlinebtn')
await p.waitForFunction(
  () => /READY TO PLAY OFFLINE/.test(document.getElementById('offlinebtn').textContent),
  null, { timeout: 900000 })
console.log('✓ full download complete:', (await p.textContent('#offlinemsg')).trim())

const cached = await p.evaluate(async () => {
  let n = 0
  for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length
  return n
})
console.log(`  ${cached} files in Cache Storage`)

// Cut the network and reload.
await ctx.setOffline(true)
console.log('— network disabled —')
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 300000 })
console.log('✓ booted with no network')

await p.click('#playbtn')
await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 300000 })
const theme = await p.evaluate(() => window.game.theme.name)
await p.click('#gobtn'); await p.waitForTimeout(600)
const state = await p.evaluate(() => {
  const g = window.game
  g.paused = true
  g.input.buttons.beam = true
  for (let n = 0; n < 6; n++) {
    const live = g.entities.filter(e => e.state !== 4)
    if (!live.length) break
    const e = live[n * 7 % live.length]
    g.ufo.pos.set(e.root.position.x, e.root.position.y + 24, e.root.position.z)
    for (let k = 0; k < 140; k++) g.update(1/60)
  }
  return { entities: g.entities.length, score: g.score, abducted: g.stats.abducted }
})
console.log(`✓ played "${theme}" offline: ${state.entities} entities, scored ${state.score} from ${state.abducted} abductions`)
await p.screenshot({ path: '/tmp/offline-play.png' })

console.log(errs.length ? `\n✗ ${errs.length} error(s): ${[...new Set(errs)].slice(0,4).join(' | ')}`
  : '\n✓ no errors offline')
await b.close()
process.exit(errs.length ? 1 : 0)
