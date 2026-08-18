/** Deterministic perf probe: same viewpoint every run. */
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 180000 })
await p.click('#playbtn'); await p.waitForTimeout(600)
const spots = [['farm',-118,-118],['medical',124,-124],['pirate',-124,124],['wilds',126,126],['meadow',0,0]]
for (const [n,x,z] of spots) {
  const r = await p.evaluate(({x,z}) => {
    const g = window.game
    g.paused = true
    g.ufo.pos.set(x, g.world.heightAt(x,z)+24, z+18); g.ufo.vel.set(0,0,0)
    for (let k=0;k<60;k++) g.update(1/60)
    g.renderer.info.reset()
    g.renderer.render(g.scene, g.camera)
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }
  }, {x,z})
  console.log(`${n.padEnd(9)} calls=${String(r.calls).padStart(4)}  tris=${(r.tris/1000).toFixed(0)}k`)
}
const mem = await p.evaluate(() => ({ ...window.game.renderer.info.memory }))
console.log('memory:', JSON.stringify(mem))
await b.close()
