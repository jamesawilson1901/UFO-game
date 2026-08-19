/** Renders the app icons from tools/icon/icon.html. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve('public/icons')
mkdirSync(out, { recursive: true })
const file = 'file://' + resolve('tools/icon/icon.html')

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [name, size, maskable] of [
  ['icon-512.png', 512, false],
  ['icon-192.png', 192, false],
  ['icon-maskable-512.png', 512, true],
  ['icon-maskable-192.png', 192, true],
  ['apple-touch-icon.png', 180, false],
]) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
  await p.goto(file + (maskable ? '?maskable=1' : ''))
  await p.waitForFunction(() => document.title === 'ready')
  const el = await p.$('#c')
  await el.screenshot({ path: `${out}/${name}`, omitBackground: !maskable, scale: 'css' })
  if (size !== 512) {
    // Downscale by re-rendering at the target size for crisp edges.
    await p.setViewportSize({ width: size, height: size })
    await p.evaluate((s) => {
      const c = document.getElementById('c')
      c.style.width = s + 'px'; c.style.height = s + 'px'
    }, size)
    await p.screenshot({ path: `${out}/${name}`, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: !maskable })
  }
  await p.close()
  console.log('  ' + name)
}
await b.close()
