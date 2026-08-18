/** One landscape screenshot per theme, from real gameplay altitude. */
import { chromium } from 'playwright'
const URL_ = process.argv[2] ?? 'http://localhost:4176/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
await p.goto(URL_, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 240000 })
await p.click('#playbtn')

for (let i = 0; i < 7; i++) {
  await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 240000 })
  const id = await p.evaluate(() => window.game.theme.id)
  await p.click('#gobtn')
  await p.waitForTimeout(300)
  await p.evaluate(() => {
    const g = window.game
    g.paused = true
    // Park over the densest cluster of animals we can find.
    const live = g.entities.filter(e => e.state !== 4 && e.built)
    let best = live[0], bestN = 0
    for (const e of live) {
      let n = 0
      for (const o of live) {
        if (Math.hypot(o.root.position.x - e.root.position.x,
                       o.root.position.z - e.root.position.z) < 34) n++
      }
      if (n > bestN) { bestN = n; best = e }
    }
    const t = best?.root.position ?? { x: 0, z: 0 }
    g.ufo.pos.set(t.x, g.world.heightAt(t.x, t.z) + 24, t.z)
    g.ufo.vel.set(0, 0, 0)
    g.input.buttons.beam = true
    for (let k = 0; k < 120; k++) g.update(1/60)
    g.renderer.render(g.scene, g.camera)
  })
  await p.screenshot({ path: `/tmp/w-${i}-${id}.png` })
  console.log(`shot ${id}`)
  await p.evaluate(() => { window.game.timeLeft = 0.1; for (let k=0;k<20;k++) window.game.update(1/60) })
  await p.waitForSelector('#results:not(.hidden)', { timeout: 30000 })
  if (i < 6) await p.click('#againbtn')
}
await b.close()
