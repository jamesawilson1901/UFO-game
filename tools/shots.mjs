/** Capture the game at each landmark, optionally in portrait. */
import { chromium } from 'playwright'
const portrait = process.argv.includes('--portrait')
const vp = portrait ? { width: 820, height: 1180 } : { width: 1400, height: 900 }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: vp })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 180000 })
await p.click('#playbtn'); await p.waitForTimeout(600)
const spots = await p.evaluate(() => {
  window.game.paused = true
  return window.game.world.landmarks
    .filter(l => ['zone','landmark','ship','building'].includes(l.kind))
    .map(l => ({ n: l.name, x: l.pos.x, z: l.pos.z }))
})
const tag = portrait ? 'p' : 'l'
for (const s of spots) {
  await p.evaluate(({x,z}) => {
    const g = window.game
    g.ufo.pos.set(x, g.world.heightAt(x,z) + 24, z + 18)
    g.ufo.vel.set(0,0,0); g.input.buttons.beam = true
    for (let k=0;k<90;k++) g.update(1/60)
    g.renderer.render(g.scene, g.camera)
  }, s)
  const f = `/tmp/${tag}-${s.n.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`
  await p.screenshot({ path: f })
  console.log(f)
}
await b.close()
