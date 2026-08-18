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

## Scoring

Every abduction scores, and chaining them within a few seconds builds a combo
multiplier up to ×9. Rarer targets are worth more — a chicken is 40, a cow 100,
a pirate captain 400, a treasure chest 300. The high score persists locally.

## Project layout

```
src/
  core/      asset loading, audio, touch input, rng
  world/     terrain, zone layout, static-geometry batching, procedural critters
  game/      the saucer, entities, the game loop
  ui/        HUD and styles
tools/
  extract-assets.sh   rebuilds public/assets from the source packs
  smoke.mjs           headless boot + play test
```

Asset licences are in [CREDITS.md](CREDITS.md).
