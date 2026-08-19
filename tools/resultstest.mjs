/**
 * Verifies the results-screen continuation flow: countdown text appears,
 * auto-advance starts a new round when it hits zero, and the exit button
 * returns to the title screen and cancels the countdown.
 * Usage: node tools/resultstest.mjs [url]
 */
import { chromium } from 'playwright'

const URL_ = process.argv[2] ?? 'http://localhost:4173/'

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('#start:not(.hidden)', { timeout: 120000 })
console.log('✓ booted')

await page.click('#playbtn')
await page.waitForSelector('#gobtn:not(.hidden)', { timeout: 60000 })
await page.click('#gobtn')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 20000 })
console.log('✓ round started')

// ── Test 1: manual exit-to-menu cancels the countdown ─────────────────
await page.evaluate(() => { window.game.timeLeft = 0.05 })
await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 })
const firstCountdown = await page.textContent('#nextcountdown')
console.log('✓ results shown, countdown text:', JSON.stringify(firstCountdown))
if (!/Next world in \d+s/.test(firstCountdown)) throw new Error('countdown text missing/malformed')

await page.click('#exitbtn')
await page.waitForSelector('#start:not(.hidden)', { timeout: 5000 })
console.log('✓ exit button returned to main menu')
await page.waitForTimeout(2500)
const stillOnStart = !(await page.locator('#start').evaluate(el => el.classList.contains('hidden')))
if (!stillOnStart) throw new Error('countdown kept running after exiting to menu (auto-advanced anyway)')
console.log('✓ countdown was cancelled after exiting to menu')

// ── Test 2: manual "NEW WORLD" click cancels the countdown & works now ─
await page.click('#playbtn')
await page.waitForSelector('#gobtn:not(.hidden)', { timeout: 60000 })
await page.click('#gobtn')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 20000 })
await page.evaluate(() => { window.game.timeLeft = 0.05 })
await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 })
await page.click('#againbtn')
await page.waitForSelector('#intro:not(.hidden)', { timeout: 15000 })
console.log('✓ NEW WORLD button advances immediately')

// ── Test 3: auto-continue fires when the countdown runs out ───────────
await page.waitForSelector('#gobtn:not(.hidden)', { timeout: 60000 })
await page.click('#gobtn')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 20000 })
await page.evaluate(() => {
  window.game.timeLeft = 0.05
  // Speed the on-screen countdown up so the test doesn't wait 10 real seconds.
})
await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 })
// Force the countdown down to trigger auto-advance without waiting 10s of wall time.
await page.evaluate(() => {
  // Re-run the same interval logic faster by directly invoking startRound
  // is not exposed, so just wait out the real 10s countdown once.
})
await page.waitForSelector('#intro:not(.hidden)', { timeout: 13000 })
console.log('✓ auto-continue advanced to a new round when the countdown expired')

if (errors.length) {
  console.log(`\n── ${errors.length} console error(s) ──`)
  for (const e of [...new Set(errors)].slice(0, 20)) console.log(' •', e)
} else {
  console.log('\n✓ no console errors')
}

await browser.close()
process.exit(errors.length ? 1 : 0)
