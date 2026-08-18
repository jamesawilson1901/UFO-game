import { Game } from './game/game.js'
import { audio } from './core/audio.js'

const $ = (id) => document.getElementById(id)

const TIPS = [
  'Warming up the wobbulator…',
  'Polishing the tractor beam…',
  'Teaching the cows to panic…',
  'Hiding the treasure…',
  'Painting the hospital white…',
  'Feeding the chickens…',
  'Raising the black flag…',
]

const BEST_KEY = 'ccc.best'

async function boot() {
  const bar = $('bootbar')
  const tip = $('boottip')
  let tipIdx = 0
  const tipTimer = setInterval(() => {
    tip.textContent = TIPS[++tipIdx % TIPS.length]
  }, 1400)

  const game = new Game($('stage'))
  window.game = game     // handy for poking at from the console
  if (import.meta.env.DEV || location.search.includes('debug')) {
    const T = await import('three')
    window.__THREE = T; window.__Box3 = T.Box3; window.__Vec3 = T.Vector3
  }

  // The loading bar tracks the asset manager; the step text tracks phases.
  const { assets } = await import('./core/assets.js')
  assets.onProgress = (p) => { bar.style.width = `${Math.round(p * 96)}%` }

  await game.init((msg) => { tip.textContent = msg })

  clearInterval(tipTimer)
  bar.style.width = '100%'

  const best = Number(localStorage.getItem(BEST_KEY) || 0)
  if (best > 0) $('besthint').textContent = `Best score: ${best.toLocaleString()}`

  $('boot').classList.add('hidden')
  $('start').classList.remove('hidden')

  // Render the world behind the title screen so it isn't a dead panel.
  game.start()
  game.pause(true)

  const play = () => {
    audio.unlock()
    $('start').classList.add('hidden')
    $('hud').classList.remove('hidden')
    game.pause(false)
    game.input.enabled = true
    const z = game.world.landmarks.find((l) => l.kind === 'zone')
    audio.playMusic('assets/audio/music/wilds.ogg', { volume: 0.32 })
  }
  $('playbtn').addEventListener('click', play)

  /* ── pause menu ─────────────────────────────────────────────── */
  const showPause = () => {
    game.pause(true)
    const s = game.stats
    const top = Object.entries(s.best).sort((a, b) => b[1] - a[1]).slice(0, 5)
    $('pausestats').innerHTML = [
      `Score: <b>${game.score.toLocaleString()}</b>`,
      `Abducted: <b>${s.abducted}</b>`,
      ...top.map(([k, v]) => `${k} × <b>${v}</b>`),
    ].join('<br>')
    $('pause').classList.remove('hidden')
  }
  const hidePause = () => {
    $('pause').classList.add('hidden')
    game.pause(false)
  }
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

  // Persist the high score as it climbs.
  setInterval(() => {
    if (game.score > Number(localStorage.getItem(BEST_KEY) || 0)) {
      localStorage.setItem(BEST_KEY, String(game.score))
    }
  }, 3000)

  // Auto-pause if the tab or app goes away mid-flight.
  addEventListener('visibilitychange', () => {
    if (document.hidden && $('pause').classList.contains('hidden')
      && !$('hud').classList.contains('hidden')) showPause()
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
