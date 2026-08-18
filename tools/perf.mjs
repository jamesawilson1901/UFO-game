/** Draw calls and triangles per world, from the player's actual viewpoint. */
import { chromium } from 'playwright'
const URL_ = process.argv[2] ?? 'http://localhost:4182/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
await p.goto(URL_, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('#start:not(.hidden)', { timeout: 240000 })
await p.click('#playbtn')
for (let i = 0; i < 7; i++) {
  await p.waitForSelector('#gobtn:not(.hidden)', { timeout: 240000 })
  const id = await p.evaluate(() => window.game.theme.id)
  await p.click('#gobtn'); await p.waitForTimeout(250)
  const r = await p.evaluate(() => {
    const g = window.game
    g.paused = true
    let worst = { calls: 0, tris: 0 }
    // Sample a few spots; the densest view is what matters.
    for (const [x, z] of [[0,0],[-90,-70],[90,80],[-100,100],[100,-100]]) {
      g.ufo.pos.set(x, g.world.heightAt(x,z)+24, z); g.ufo.vel.set(0,0,0)
      for (let k=0;k<30;k++) g.update(1/60)
      g.renderer.info.reset()
      g.renderer.render(g.scene, g.camera)
      const c = g.renderer.info.render
      if (c.calls > worst.calls) worst = { calls: c.calls, tris: c.triangles }
    }
    return { ...worst, ents: g.entities.length, mem: { ...g.renderer.info.memory } }
  })
  console.log(`${id.padEnd(9)} worst-view calls=${String(r.calls).padStart(4)} tris=${(r.tris/1000).toFixed(0).padStart(4)}k ents=${String(r.ents).padStart(3)} geo=${r.mem.geometries} tex=${r.mem.textures}`)
  await p.evaluate(() => { window.game.timeLeft = 0.1; for (let k=0;k<20;k++) window.game.update(1/60) })
  await p.waitForSelector('#results:not(.hidden)', { timeout: 30000 })
  if (i < 6) await p.click('#againbtn')
}
await b.close()
