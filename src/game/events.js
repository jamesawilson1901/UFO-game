/**
 * Silliness, on a timer.
 *
 * Random events every 30-45 seconds. They exist purely to make a five- and a
 * seven-year-old shout at the screen, so each one is loud, obvious, and
 * changes what's on screen immediately — nothing subtle, nothing punishing.
 */

export const COLLECT_QUIPS = {
  Cow: ['MOO-VED!', 'UDDERLY ABDUCTED!', 'COWABUNGA!', 'GOT THE MOO!', 'BEEF ME UP!'],
  Calf: ['LITTLE MOO!', 'BABY ABOARD!', 'SO SMALL!'],
  'Prize Bull': ['BIG BEEFY BOY!', 'THAT ONE IS HUGE!', 'BULLSEYE!'],
  Pig: ['OINK OINK GONE!', 'BACON BEAMED!', 'PIGGY IN SPACE!'],
  Sheep: ['BAA-BYE!', 'FLUFF ABOARD!', 'WOOLLY WONDERFUL!'],
  Chicken: ['BAWK! GONE!', 'CHICKEN SNATCHED!', 'EGGS-CELLENT!'],
  Skeleton: ['BONE VOYAGE!', 'RATTLE ROLL!', 'SPOOKY SNATCH!'],
  Snowman: ['CHILLY CATCH!', 'FROSTY ABOARD!'],
  Santa: ['HO HO HOOVERED!', 'SANTA NAPPED!'],
  Portaloo: ['EWWW!', 'SOMEONE WAS IN THERE!', 'STINKY CATCH!'],
  Doctor: ['IS THERE A DOCTOR IN THE SAUCER?'],
  Patient: ['STILL IN HIS GOWN!', 'HE WAS POORLY!'],
  Pirate: ['YARR! GOTCHA!', 'WALK THE BEAM!'],
  _default: ['GOT IT!', 'NICE ONE!', 'ZOOP!', 'ABDUCTED!', 'IN THE HOLD!'],
}

export const COMBO_SHOUTS = {
  3: 'TRIPLE! 🔥',
  5: 'FIVE IN A ROW! 🤩',
  7: 'SEVEN!! UNSTOPPABLE!',
  9: 'MAXIMUM MOO! 🐄🐄🐄',
}

export function quipFor(label) {
  const list = COLLECT_QUIPS[label] ?? COLLECT_QUIPS._default
  return list[Math.floor(Math.random() * list.length)]
}

export const EVENTS = [
  {
    id: 'cowrain',
    banner: '🐄 IT IS RAINING COWS! 🐄',
    color: 0xffd23f,
    /** Cows fall out of the sky around the player. Reliably the biggest laugh. */
    run(game) {
      const { rng, ufo } = game
      for (let i = 0; i < 14; i++) {
        const a = rng.range(0, Math.PI * 2)
        const r = rng.range(10, 60)
        const x = ufo.pos.x + Math.cos(a) * r
        const z = ufo.pos.z + Math.sin(a) * r
        if (Math.abs(x) > game.world.half - 12 || Math.abs(z) > game.world.half - 12) continue
        const kind = rng.pick(['cow', 'cow', 'calf', 'pig', 'sheep', 'chicken'])
        const e = game.spawnCritterAt(kind, x, z)
        if (!e) continue
        e.root.position.y = ufo.pos.y + rng.range(30, 70)
        e.velY = 0
        e.panic = 1
        e.state = 2
      }
    },
  },
  {
    id: 'stampede',
    banner: '🏃 STAMPEDE! EVERYONE RUN! 🏃',
    color: 0xff6b6b,
    /** Everything nearby bolts in the same direction at once. */
    run(game) {
      const dir = game.rng.range(0, Math.PI * 2)
      for (const e of game.entities) {
        if (e.state === 4 || !e.built) continue
        const d = Math.hypot(e.root.position.x - game.ufo.pos.x, e.root.position.z - game.ufo.pos.z)
        if (d > 150) continue
        e.stun = 0
        e.panic = 1
        e.state = 1
        e.think = 6
        e.target.set(
          e.root.position.x + Math.cos(dir) * 90,
          e.root.position.z + Math.sin(dir) * 90,
        )
        e.speed *= 1.6
      }
      setTimeout(() => {
        for (const e of game.entities) if (e.built && e.speed) e.speed /= 1.6
      }, 6000)
    },
  },
  {
    id: 'double',
    banner: '⭐ DOUBLE POINTS! ⭐',
    color: 0x8ef26a,
    run(game) {
      game.pointsMultiplier = 2
      game.multiplierUntil = game.t + 25
    },
  },
  {
    id: 'golden',
    banner: '🌟 GOLDEN HERD! 🌟',
    color: 0xffd23f,
    /** A little cluster of golden animals, all at once. */
    run(game) {
      const s = game.world.randomSpot(game.rng, { clear: 40, from: game.ufo.pos, radius: 120 })
      if (!s) return
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        game.spawnCritterAt('cow', s.x + Math.cos(a) * 9, s.z + Math.sin(a) * 9, { golden: true })
      }
      game.hud.toast('Golden cows! Find them!', 0xffd23f)
    },
  },
  {
    id: 'partytime',
    banner: '🎉 CONFETTI PARTY! 🎉',
    color: 0xff9ecb,
    run(game) {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!game.scene) return
          game.burst(game.ufo.pos.clone().setY(game.ufo.pos.y + 6),
            [0xff6b6b, 0xffd23f, 0x8ef26a, 0x7df9ff, 0xff9ecb][i % 5], 40, 16)
        }, i * 220)
      }
    },
  },
]

export function pickEvent(rng, lastId) {
  const pool = EVENTS.filter((e) => e.id !== lastId)
  return pool[Math.floor(rng() * pool.length)]
}
