# 🛸 Cosmic Cow Caper

A 3/4 top-down sandbox where you fly a flying saucer around a sprawling
countryside and beam up everything that moves. Built for a five-year-old and a
seven-year-old: no fail state, no timer, no way to lose — just a big world, a
big score, and cows that panic in a very satisfying way.

## Play

```bash
npm install
npm run dev      # then open the printed URL on your tablet/phone
```

```bash
npm run build && npm run preview   # production build
```

## Controls

Designed thumbs-first for a tablet held in two hands.

| Control | Action |
|---|---|
| **Left stick** | Fly the saucer |
| **A** (green, right) | Hold to fire the tractor beam |
| **B** (red, bottom) | Boost |
| **X** (blue, top) | Drop whatever is in the hold |
| **Y** (yellow, left) | MOO — startles every animal nearby |

Keyboard also works: `WASD`/arrows to fly, `Space` beam, `Shift` boost,
`E` drop, `Q` moo, `Esc` pause. A gamepad works too.

## The world

Four districts around a central meadow, each with its own music:

- **Sunnyside Farm** — barns, silos, windmills, crop rows and paddocks packed
  with cows, calves, pigs, sheep, chickens and the occasional prize bull.
- **St. Bovine Hospital** — doctors, nurses and patients milling about a white
  hospital with a big red cross you can see from orbit.
- **Rotten Cove** — pirate ships at anchor, cannons, treasure chests, docks and
  a ghost ship.
- **The Whispering Wilds** — dense forest, boulders, mushrooms and a camp.

Each district has a **golden cow**: eight times the points, noticeably faster,
and impossible to miss from the air.

## Scoring

Every abduction scores, and chaining them within a few seconds builds a combo
multiplier up to ×9. Rarer targets are worth more — a chicken is 40, a cow 100,
a pirate captain 400, a treasure chest 300, a golden cow 800. The high score
persists locally.

Score also drives a **rank ladder**, from Space Cadet up to Supreme Cow
Commander. There is no way to lose rank and no way to fail.

Anything you abduct is restocked elsewhere in its own district after 20–40
seconds, so the world never runs out.

## Finding your way

A minimap in the top-left shows the four districts by colour and icon, with
your saucer as an arrow. It is deliberately wordless — a five-year-old
navigates by colour and shape, not labels.

## Project layout

```
src/
  core/      asset loading, audio, touch input, rng
  world/     terrain, zone layout, static-geometry batching, procedural critters
  game/      the saucer, entities, the game loop
  ui/        HUD and styles
tools/
  extract-assets.sh   rebuilds public/assets from the source packs
  smoke.mjs           headless boot + drive test
  playtest.mjs        fixed-step gameplay test (scoring, combos, respawn)
  touchtest.mjs       multi-touch check on a simulated iPad
  perf.mjs            per-district draw-call and triangle counts
  shots.mjs           screenshots of every landmark
```

Run them against a preview server:

```bash
npm run build && npm run preview &
node tools/playtest.mjs
```

Note that the headless browser renders through SwiftShader at roughly 1 fps,
so the real-time tests deliberately step `game.update()` directly rather than
relying on wall-clock time.

Asset licences are in [CREDITS.md](CREDITS.md).
