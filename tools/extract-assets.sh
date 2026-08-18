#!/usr/bin/env bash
# Pulls the curated asset set out of the source packs into public/assets/.
# Sources are large read-only asset libraries kept outside this repo:
#   UP  - the raw uploads folder
#   MG  - a clone of jamesawilson1901/my-games
# Re-runnable; every step is idempotent.
set -euo pipefail

UP="${UP:-/root/.claude/uploads/4ab8e5b6-1b15-522d-ba8e-74e80c0ec085}"
MG="${MG:-/workspace/my-games}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/assets"

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
have() { [ -e "$1" ] || { echo "  !! missing source: $1" >&2; return 1; }; }

mkdir -p "$OUT"/{nature,farm,pirate,town,food,chars,ufo,props,audio/sfx,audio/music,ui,sky}

# ── nature: 329 self-contained flat-shaded GLBs (Kenney Nature Kit, CC0) ──────
say "nature kit"
have "$UP"/5749873f-kenney_nature_kit_glb_cc0_v1.zip &&
  unzip -o -j -q "$UP"/5749873f-kenney_nature_kit_glb_cc0_v1.zip \
    'kenney_nature_kit_glb_cc0_v1/models_glb/*.glb' -d "$OUT/nature"

# ── pirate: ships, cannons, docks, palms (Kenney Pirate Kit) ──────────────────
say "pirate kit"
have "$MG/Kenny/GLB format" &&
  cp -f "$MG/Kenny/GLB format"/*.glb "$OUT/pirate/"

# ── town: walls/roofs/roads — reskinned into the medical zone ─────────────────
say "fantasy town kit"
have "$MG/Kenny/kenney_fantasy-town-kit_2.0.zip" &&
  unzip -o -j -q "$MG/Kenny/kenney_fantasy-town-kit_2.0.zip" \
    'Models/GLB format/*.glb' -d "$OUT/town"

# ── food: comedy abductables (pizza, burger, cake, donut …) ──────────────────
say "food kit"
have "$MG/Kenny/kenney_food-kit.zip" &&
  unzip -o -j -q "$MG/Kenny/kenney_food-kit.zip" 'Models/GLB format/*.glb' -d "$OUT/food"

# ── themed kits: one world is built from each ────────────────────────────────
say "holiday kit (snow world)"
have "$MG/Kenny/kenney_holiday-kit.zip" &&
  unzip -o -j -q "$MG/Kenny/kenney_holiday-kit.zip" 'Models/GLB format/*.glb' -d "$OUT/holiday"

say "castle kit (siege world)"
have "$MG/Kenny/kenney_castle-kit.zip" &&
  unzip -o -j -q "$MG/Kenny/kenney_castle-kit.zip" 'Models/GLB format/*.glb' -d "$OUT/castle"

say "survival kit (jungle camp world)"
have "$MG/Kenny/kenney_survival-kit.zip" &&
  unzip -o -j -q "$MG/Kenny/kenney_survival-kit.zip" 'Models/GLB format/*.glb' -d "$OUT/survival"

say "graveyard (spooky world)"
have "$MG/kyrises-voxel-graveyard-environment-pack.zip" &&
  unzip -o -j -q "$MG/kyrises-voxel-graveyard-environment-pack.zip" 'glTF/*' -d "$OUT/spooky"

say "skeletons (spooky world NPCs)"
have "$MG/Kenny/KayKit_Skeletons_1.1_FREE.zip" &&
  unzip -o -j -q "$MG/Kenny/KayKit_Skeletons_1.1_FREE.zip" \
    'KayKit_Skeletons_1.1_FREE/characters/gltf/*' -d "$OUT/chars"

# ── palette atlases ─────────────────────────────────────────────────────────
# Every Kenney kit ships its OWN colormap.png and references it by relative
# path. They are NOT interchangeable — using one kit's atlas for another maps
# every surface to the wrong swatch (snow turns black, cabins turn grey).
say "colormaps"
copy_colormap() {   # <zip> <out-subdir>
  local zip="$1" out="$2"
  mkdir -p "$OUT/$out/Textures"
  unzip -o -j -q "$zip" 'Models/GLB format/Textures/colormap.png' \
    -d "$OUT/$out/Textures" 2>/dev/null || echo "  ?? no colormap in $(basename "$zip")"
}
copy_colormap "$MG/Kenny/kenney_fantasy-town-kit_2.0.zip" town
copy_colormap "$MG/Kenny/kenney_food-kit.zip"             food
copy_colormap "$MG/Kenny/kenney_holiday-kit.zip"          holiday
copy_colormap "$MG/Kenny/kenney_castle-kit.zip"           castle
copy_colormap "$MG/Kenny/kenney_survival-kit.zip"         survival
# The pirate kit was unpacked as loose files, so its atlas sits beside them.
mkdir -p "$OUT/pirate/Textures"
cp -f "$MG/Kenny/GLB format/Textures/colormap.png" "$OUT/pirate/Textures/" 2>/dev/null || true

# ── farm: Quaternius barns/silos/windmills (OBJ+MTL, vertex-coloured) ────────
say "farm buildings"
have "$UP"/ecf2054b-Farm_Buildings_by_Quaternius.zip &&
  unzip -o -j -q "$UP"/ecf2054b-Farm_Buildings_by_Quaternius.zip 'OBJ/*' -d "$OUT/farm"

say "tractor + porta potty"
cp -f "$UP"/8d565015-Tractor_by_Poly_by_Google__5TGoA5N14c5.glb "$OUT/props/tractor.glb"
unzip -o -q "$UP"/5531db53-porta_potty_low_poly_style.zip -d "$OUT/props/portapotty"

# ── characters: rigged KayKit adventurers + shared animation library ─────────
say "characters"
have "$MG/Kenny/KayKit_Adventurers_2.0_FREE.zip" && {
  unzip -o -j -q "$MG/Kenny/KayKit_Adventurers_2.0_FREE.zip" \
    'KayKit_Adventurers_2.0_FREE/Characters/gltf/*' -d "$OUT/chars"
  unzip -o -j -q "$MG/Kenny/KayKit_Adventurers_2.0_FREE.zip" \
    'KayKit_Adventurers_2.0_FREE/Animations/gltf/Rig_Medium/*.glb' -d "$OUT/chars"
}

# ── the player ───────────────────────────────────────────────────────────────
say "UFO"
unzip -o -j -q "$UP"/8c26ec9e-UFO.zip 'UFO/Models/ufo.fbx' 'UFO/Models/UFOTexture.png' \
  'UFO/Models/AO_UFO.png' -d "$OUT/ufo"

# ── audio ────────────────────────────────────────────────────────────────────
say "sfx"
for s in forceField_000 forceField_001 forceField_002 forceField_003 \
         spaceEngine_000 spaceEngineLow_000 spaceEngineLarge_000 thrusterFire_000 \
         laserSmall_000 laserSmall_001 laserRetro_000 laserRetro_001 \
         computerNoise_000 computerNoise_001 computerNoise_002 \
         explosionCrunch_000 explosionCrunch_002 lowFrequency_explosion_000 \
         doorOpen_000 doorClose_000 impactMetal_000 impactMetal_003 slime_000 slime_002; do
  unzip -o -j -q "$UP"/f18224d3-kenney_scifisounds.zip "Audio/$s.ogg" -d "$OUT/audio/sfx" 2>/dev/null || true
done
cp -f "$UP"/71270168-ANMLFarm_Cow_moos_ID_0546_BigSoundBank.com.wav "$OUT/audio/sfx/cow-moo.wav"

say "music"
# Loopable, kid-friendly tracks. ogg keeps them ~2MB each.
copy_track() { [ -f "$MG/Music & SFX/$1" ] && cp -f "$MG/Music & SFX/$1" "$OUT/audio/music/$2" || echo "  ?? no $1"; }
copy_track "04. Peaceful Village.ogg"   "farm.ogg"
copy_track "02. Lively City.ogg"        "medical.ogg"
copy_track "05. Long Journey.ogg"       "pirate.ogg"
copy_track "08. Wood Forest Town.ogg"   "wilds.ogg"

# ── touch UI (Kenney mobile controls, 2x sprites for crisp scaling) ──────────
say "controls"
UIZ="$UP/0d213814-mobilecontrols1.zip"
UIDIR='Sprites/Style A/Large (2#U00d7)'
for f in joystick_circle_pad_b joystick_circle_nub_b button_circle; do
  unzip -o -j -q "$UIZ" "$UIDIR/$f.png" -d "$OUT/ui" 2>/dev/null || true
done
unzip -o -j -q "$UIZ" 'Sprites/Highlights A/Large (2#U00d7)/button_circle_highlight.png' \
  'Sprites/Highlights A/Large (2#U00d7)/joystick_circle_pad_highlight.png' -d "$OUT/ui" 2>/dev/null || true

# ── sky ──────────────────────────────────────────────────────────────────────
say "sky"
unzip -o -j -q "$UP"/34081a44-sbs__cloudy_skyboxes__panorama.zip \
  'Panorama/Panorama_Sky_01-512x512.png' 'Panorama/Panorama_Sky_04-512x512.png' -d "$OUT/sky" 2>/dev/null || true
unzip -o -j -q "$UP"/33fe879a-kenney_skyboxes.zip 'Skyboxes/skybox-day.png' -d "$OUT/sky" 2>/dev/null || true

say "done"
du -sh "$OUT"/* | sort -h
echo
echo "TOTAL: $(du -sh "$OUT" | cut -f1)"
