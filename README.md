# 🛸 Cosmic Cow Caper

A 3/4 top-down arcade sandbox where you fly a saucer over a randomly-chosen
themed world and beam up everything that moves. Built for a five-year-old and
a seven-year-old: no way to lose, a three-minute round, and a rival alien who
turns up to steal your cows.

**Play:** https://jamesawilson1901.github.io/UFO-game/

## Install on a phone or tablet (works with no internet)

1. Open the link above in Chrome (Android) or Safari (iOS).
2. Tap **📥 MAKE IT WORK OFFLINE** on the title screen and let it finish
   (~52 MB, one time).
3. Add it to the home screen — Chrome offers "Install app"; on iOS use
   **Share → Add to Home Screen**.

It then launches from its own tile, full screen, with no browser bar and no
network. The app shell is cached automatically; the worlds are only fetched
when you ask, because silently pulling 52 MB over mobile data would be rude.

## Play locally

```bash
npm install
npm run dev      # open the printed Network URL on a tablet
```

## Controls

Landscape only — there is a thumb-stick in each bottom corner, so the game
prompts you to rotate if the device is upright.

| Control | Action |
|---|---|
| **Left stick** | Fly the saucer |
| **A** (green) | Hold to fire the tractor beam |
| **B** (red) | LASER — vaporises objects, zaps the rival, makes animals dizzy |
| **X** (blue) | Boost |
| **Y** (yellow) | MOO — startles every animal nearby |

Keyboard: `WASD`/arrows fly, `Space` beam, `F` laser, `Shift` boost, `Q` moo,
`Esc` pause. Gamepads work too.

## Nine worlds

One is drawn at random each round, from a shuffled bag so you see all nine
before any repeats.

| World | What's in it |
|---|---|
| 🐄 **Sunnyside Farm** | Barns, silos, windmills, crop rows, paddocks packed with livestock |
| 🏴‍☠️ **Rotten Cove** | Pirate ships at anchor, a ghost ship, cannons, treasure, docks |
| 🏥 **St. Bovine Hospital** | Doctors, nurses, patients in gowns, ambulances, a big red cross |
| 👻 **Boo Hill Graveyard** | Crypts, iron railings, and actual ghosts, zombies and vampires |
| ⛄ **Jinglebell Valley** | Cabins, snowmen, reindeer, presents and a toy train on a loop |
| 🏰 **Siege of Castle Moo** | A walled castle, keep, catapults and trebuchets |
| 🌴 **Lost Jungle Camp** | Tents, campfires, workbenches, palms and a lagoon |
| 🚕 **Moo York City** | Tower blocks, roads and traffic — beam up taxis and fire engines |
| 🚀 **Planet Mooo** | A red planet: landing pad, rockets, craters, satellite dishes |

## Chaos

Something silly fires every 30–45 seconds:

**🐄 IT IS RAINING COWS** · **🏃 STAMPEDE** · **⭐ DOUBLE POINTS** ·
**🌟 GOLDEN HERD** · **🎉 CONFETTI PARTY** · **🌙 MOON GRAVITY** (everything
floats) · **🟢 MEGA BEAM** (twice the width) · **🐄 GIGANTIC COW** (2,500
points) · **🐥 TINY ANIMAL INVASION** · **🍕 FOOD FIGHT** · **🪩 DISCO TIME** ·
**🛸 TWO ALIENS**

## The rival alien

Roughly a minute in, a green saucer swoops in taunting you. It rams you — your
hold pops open and cows rain out — then hoovers them up while you watch. Shoot
it enough times with the laser and it spirals off trailing smoke (750 points).
It cannot actually hurt you; the worst it does is steal your cows and gloat.

## Lasers

Objects **vaporise** for points. Anything alive only gets **dizzy** — it sits
down seeing stars and is much easier to beam up. Nothing living is ever
destroyed, which keeps the game silly rather than nasty and makes the laser a
tool rather than a punishment.

## Scoring

Chaining abductions within a few seconds builds a combo up to ×9. A chicken is
40, a cow 100, a pirate captain 400, a treasure chest 300, Santa 500. Each
world hides two **golden cows** worth eight times the usual.

Score drives a rank ladder from Space Cadet to Supreme Cow Commander, and best
scores are kept per world.

## Project layout

```
src/
  core/      asset loading, audio, touch input, rng
  world/     themes, terrain, static-geometry batching, procedural critters
  game/      saucer, lasers, rival, entities, round loop
  ui/        HUD, minimap, styles
tools/
  extract-assets.sh   rebuilds public/assets from the source packs
  serve.sh            build + serve on a fixed port
  themetest.mjs       boots every world and plays a full round in each
  worldshots.mjs      one screenshot per world
  playtest.mjs        scoring, combos, respawn
  touchtest.mjs       three-finger multi-touch on a simulated iPad
  perf.mjs            draw-call and triangle counts
```

The headless browser renders through SwiftShader at roughly 1 fps, so the
tests step `game.update()` directly rather than relying on wall-clock time.

Asset licences are in [CREDITS.md](CREDITS.md).
