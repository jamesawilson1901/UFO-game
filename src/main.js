import { Game, ROUND_SECONDS } from './game/game.js'
import { audio } from './core/audio.js'
import { assets, url } from './core/assets.js'

const $ = (id) => document.getElementById(id)
const BEST_KEY = 'ccc.best'
const BEST_BY_WORLD = 'ccc.bestByWorld'

const TIPS = [
  'Warming up the wobbulator…',
  'Polishing the tractor beam…',
  'Teaching the cows to panic…',
  'Charging the laser…',
  'Hiding the treasure…',
  'Feeding the chickens…',
  'Waking the rival alien…',
]

/** CSS can't know the deploy base path, so sprite URLs are set here. */
function paintControlSprites() {
  const r = document.documentElement.style
  r.setProperty('--img-stick-pad', `url("${url('assets/ui/joystick_circle_pad_b.png')}")`)
  r.setProperty('--img-stick-nub', `url("${url('assets/ui/joystick_circle_nub_b.png')}")`)
  r.setProperty('--img-button', `url("${url('assets/ui/button_circle.png')}")`)
}

/**
 * The HUD puts a thumb-stick in each bottom corner, so the game is
 * landscape-only. Rather than squash it, portrait gets a rotate prompt and
 * the game pauses underneath.
 */
function watchOrientation(game) {
  const check = () => {
    const portrait = innerHeight > innerWidth
    $('rotate').classList.toggle('hidden', !portrait)
    if (portrait && game?.running && !game.paused) game.pause(true)
    else if (!portrait && game?.running && game.paused && $('pause').classList.contains('hidden')
      && !$('hud').classList.contains('hidden')) game.pause(false)
  }
  addEventListener('resize', check)
  addEventListener('orientationchange', () => setTimeout(check, 120))
  check()
}

const bestByWorld = () => {
  try { return JSON.parse(localStorage.getItem(BEST_BY_WORLD) || '{}') } catch { return {} }
}

/**
 * Registers the service worker and wires the offline download.
 *
 * The shell is precached automatically so the game always launches, but the
 * ~50 MB of worlds is only fetched when the player asks for it — silently
 * pulling that over mobile data would be rude.
 */
async function setupOffline() {
  const btn = $('offlinebtn')
  const bar = $('offlinebar')
  const prog = $('offlineprog')
  const msg = $('offlinemsg')
  if (!('serviceWorker' in navigator)) {
    msg.textContent = 'Offline play needs a modern browser.'
    return
  }
  let reg
  try {
    reg = await navigator.serviceWorker.register(url('sw.js'), { scope: new URL(url('.')).pathname })
  } catch (e) {
    msg.textContent = 'Offline play unavailable here.'
    return
  }
  await navigator.serviceWorker.ready

  let sizeText = ''
  try {
    const m = await (await fetch(url('asset-manifest.json'))).json()
    sizeText = ` (${Math.round(m.totalBytes / 1048576)} MB)`
  } catch {}

  // Already downloaded? Estimate from the Cache Storage entry count.
  const alreadyDone = await (async () => {
    try {
      const m = await (await fetch(url('asset-manifest.json'))).json()
      const keys = await caches.keys()
      for (const k of keys) {
        const c = await caches.open(k)
        if ((await c.keys()).length >= m.shell.length + m.assets.length - 5) return true
      }
    } catch {}
    return false
  })()

  btn.classList.remove('hidden')
  if (alreadyDone) {
    btn.textContent = '✅ READY TO PLAY OFFLINE'
    btn.classList.add('done')
    msg.textContent = 'Add it to your home screen and play with no internet.'
    return
  }
  btn.textContent = `📥 MAKE IT WORK OFFLINE${sizeText}`

  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data ?? {}
    if (d.type === 'PRECACHE_PROGRESS') {
      const pct = Math.round((d.done / d.total) * 100)
      prog.style.width = `${pct}%`
      msg.textContent = `Downloading… ${pct}%  (${d.done} of ${d.total})`
    } else if (d.type === 'PRECACHE_DONE') {
      prog.style.width = '100%'
      btn.textContent = '✅ READY TO PLAY OFFLINE'
      btn.classList.add('done')
      btn.disabled = false
      msg.textContent = 'Done! Add it to your home screen and play with no internet.'
    } else if (d.type === 'PRECACHE_FAILED') {
      btn.disabled = false
      btn.textContent = '📥 TRY AGAIN'
      msg.textContent = 'Download failed — check your connection.'
    }
  })

  btn.addEventListener('click', () => {
    const sw = navigator.serviceWorker.controller ?? reg.active
    if (!sw) { msg.textContent = 'Reload the page, then try again.'; return }
    btn.disabled = true
    btn.textContent = '⏳ DOWNLOADING…'
    bar.classList.remove('hidden')
    msg.textContent = 'Starting…'
    sw.postMessage({ type: 'PRECACHE_ALL' })
  })
}

async function boot() {
  paintControlSprites()

  const bar = $('bootbar')
  const tip = $('boottip')
  let tipIdx = 0
  const tipTimer = setInterval(() => { tip.textContent = TIPS[++tipIdx % TIPS.length] }, 1400)

  const game = new Game($('stage'))
  window.game = game
  if (import.meta.env.DEV || location.search.includes('debug')) {
    const T = await import('three')
    window.__THREE = T; window.__Box3 = T.Box3; window.__Vec3 = T.Vector3
  }

  assets.onProgress = (p) => { bar.style.width = `${Math.round(p * 96)}%` }
  await game.initEngine()
  watchOrientation(game)

  /* ── round flow ─────────────────────────────────────────────── */
  const AUTO_NEXT_SECONDS = 10
  let resultsTimer = null
  const clearResultsTimer = () => { if (resultsTimer) { clearInterval(resultsTimer); resultsTimer = null } }

  const startRound = async () => {
    clearResultsTimer()
    const theme = game.pickTheme()
    $('introicon').textContent = theme.icon
    $('introname').textContent = theme.name
    $('introblurb').textContent = theme.blurb
    $('introbar').style.width = '0%'
    $('gobtn').classList.add('hidden')
    $('results').classList.add('hidden')
    $('start').classList.add('hidden')
    $('hud').classList.add('hidden')
    $('intro').classList.remove('hidden')

    assets.onProgress = (p) => { $('introbar').style.width = `${Math.round(p * 100)}%` }
    await game.startRound(theme, (msg) => { $('introblurb').textContent = msg })

    $('introblurb').textContent = theme.blurb
    $('introbar').style.width = '100%'
    game.minimap.setLandmarks(game.world.landmarks, theme.ground)
    game.start()
    game.pause(true)
    $('gobtn').classList.remove('hidden')
  }

  const go = () => {
    audio.unlock()
    $('intro').classList.add('hidden')
    $('hud').classList.remove('hidden')
    game.pause(false)
    game.countdownIn()
  }
  $('gobtn').addEventListener('click', go)

  game.onRoundEnd = (r) => {
    game.pause(true)
    const best = Math.max(Number(localStorage.getItem(BEST_KEY) || 0), r.score)
    localStorage.setItem(BEST_KEY, String(best))
    const per = bestByWorld()
    const prev = per[r.theme.id] ?? 0
    const isBest = r.score > prev
    if (isBest) { per[r.theme.id] = r.score; localStorage.setItem(BEST_BY_WORLD, JSON.stringify(per)) }

    audio.play(isBest ? 'v_highscore' : 'v_congrats', { volume: 0.95 })
    $('finalscore').textContent = r.score.toLocaleString()
    $('finalrank').textContent = r.rank.name
    $('finalbest').textContent = isBest
      ? `🏆 NEW BEST IN ${r.theme.name.toUpperCase()}!`
      : `Best here: ${prev.toLocaleString()}`
    const top = Object.entries(r.stats.best).sort((a, b) => b[1] - a[1]).slice(0, 4)
    $('finalstats').innerHTML = [
      `Beamed up: <b>${r.stats.abducted}</b>`,
      r.stats.vaporised ? `Vaporised: <b>${r.stats.vaporised}</b>` : '',
      r.stats.rivalsDowned ? `Rivals shot down: <b>${r.stats.rivalsDowned}</b>` : '',
      r.stats.stolen ? `Cows stolen from you: <b>${r.stats.stolen}</b>` : '',
      ...top.map(([k, v]) => `${k} × <b>${v}</b>`),
    ].filter(Boolean).join('<br>')

    $('hud').classList.add('hidden')
    $('results').classList.remove('hidden')

    let remaining = AUTO_NEXT_SECONDS
    $('nextcountdown').textContent = `Next world in ${remaining}s…`
    clearResultsTimer()
    resultsTimer = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearResultsTimer()
        startRound()
      } else {
        $('nextcountdown').textContent = `Next world in ${remaining}s…`
      }
    }, 1000)
  }
  $('againbtn').addEventListener('click', () => startRound())

  const goToMenu = () => {
    clearResultsTimer()
    $('results').classList.add('hidden')
    $('hud').classList.add('hidden')
    const best = Number(localStorage.getItem(BEST_KEY) || 0)
    if (best > 0) $('besthint').textContent = `Best score: ${best.toLocaleString()}`
    $('start').classList.remove('hidden')
  }
  $('exitbtn').addEventListener('click', () => { audio.unlock(); goToMenu() })

  clearInterval(tipTimer)
  bar.style.width = '100%'
  const best = Number(localStorage.getItem(BEST_KEY) || 0)
  if (best > 0) $('besthint').textContent = `Best score: ${best.toLocaleString()}`
  $('boot').classList.add('hidden')
  $('start').classList.remove('hidden')
  setupOffline().catch((e) => console.warn('[offline]', e))

  $('playbtn').addEventListener('click', () => { audio.unlock(); startRound() })

  /* ── pause ──────────────────────────────────────────────────── */
  const showPause = () => {
    if ($('hud').classList.contains('hidden')) return
    game.pause(true)
    const s = game.stats
    const top = Object.entries(s.best).sort((a, b) => b[1] - a[1]).slice(0, 5)
    $('pausestats').innerHTML = [
      `Score: <b>${game.score.toLocaleString()}</b>`,
      `Beamed up: <b>${s.abducted}</b>`,
      ...top.map(([k, v]) => `${k} × <b>${v}</b>`),
    ].join('<br>')
    $('pause').classList.remove('hidden')
  }
  const hidePause = () => { $('pause').classList.add('hidden'); game.pause(false) }
  $('pausebtn').addEventListener('click', showPause)
  $('resumebtn').addEventListener('click', hidePause)
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return
    $('pause').classList.contains('hidden') ? showPause() : hidePause()
  })
  $('musicbtn').addEventListener('click', (e) => {
    audio.setMusic(!audio.musicOn)
    e.target.textContent = `MUSIC: ${audio.musicOn ? 'ON' : 'OFF'}`
  })
  $('sfxbtn').addEventListener('click', (e) => {
    audio.setSfx(!audio.sfxOn)
    e.target.textContent = `SOUND: ${audio.sfxOn ? 'ON' : 'OFF'}`
  })
  addEventListener('visibilitychange', () => {
    if (document.hidden) showPause()
  })
}

boot().catch((err) => {
  console.error(err)
  const tip = $('boottip')
  if (tip) {
    tip.innerHTML = `<b style="color:#ff9b9b">Something went wrong.</b><br>
      <span style="font-size:.8em;opacity:.8">${String(err.message || err)}</span>`
  }
})
