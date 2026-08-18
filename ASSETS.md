# Gesture Runner — art assets

## What is in the game

**Everything on screen is a sprite except the sky, which is drawn.**

### The character — rvros, *Animated Pixel Adventurer*

<https://rvros.itch.io/animated-pixel-hero>

Nine animations, all from the same artist, so there is no style seam:

| game state | source animation | frames | fps |
|---|---|---|---|
| `idle` | `adventurer-idle` | 4 | 8 |
| `walk` | `adventurer-run` | 6 | 9 |
| `run` | `adventurer-run` | 6 | 15 |
| `jump` | `adventurer-jump` | 4 | 11 |
| `fall` | `adventurer-fall` | 2 | 8 |
| `slide` | `adventurer-slide` | 2 | 8 |
| `slash` | `adventurer-attack1` | 5 | 18 |
| `shoot` | `adventurer-bow` | 9 | 32 |
| `death` | `adventurer-die` | 7 | 9 |

Two things worth knowing about that table.

**The pack has no walk cycle.** It is not among the 39 animations and not in the
individual sprites. So walking is the run row played at 9 fps against running's
15 — the same legs, visibly slower. That reads as the state change it is, and it
costs nothing on the sheet: both entries point at the same row.

**Shooting came from the same artist.** The download page carries an
`Adventurer-Bow` add-on: 9 frames of draw-aim-release with the arrow leaving the
bow, same character, same 50×37. So the ranged attack does not look borrowed
from somewhere else — which was the thing to avoid. The `shoot` action timer was
lengthened to 0.28 s to let the release finish, and the projectile is an arrow
rather than a bullet, because that is what the animation fires.

Licence, quoted from the page:

> "You can use this asset for personal and commercial purpose. Credit is not
> required but would be appreciated."

and, under what you cannot do:

> "Resell/redistribute this asset."

Modification is explicitly allowed. Name-your-own-price with a free option,
taken through the free path.

### The enemies — LuizMelo, *Monsters Creatures Fantasy*

<https://luizmelo.itch.io/monsters-creatures-fantasy>

Licence: **CC0**, quoted from the page — "This package can be used in commercial
and non-commercial projects". Credits appreciated, not required.

Four creatures, and they happen to map onto the game's three enemy roles exactly:

| entity | creature | why |
|---|---|---|
| `enemyGun` | **Goblin** and **Mushroom**, alternating | small, dies to one arrow; two of them so a patrol is not two clones |
| `enemySword` | **Skeleton** | carries a shield, which is the whole reason arrows bounce off it |
| `target` | **Flying Eye** | harmless and airborne, so it sits at the head height the targets already used |

They all face **left**, towards the oncoming player, which is what a runner
needs and is why they did not have to be flipped.

### Objects, obstacles and ground — drawn for this game

`obj-block`, `obj-spike`, `obj-beam`, `obj-gate`, `obj-orb`, `obj-arrow`,
`obj-ground`, `obj-ledge`. Authored in the palette of the two packs above,
at **1 pixel = 1 world unit**, so they scale by whole numbers and stay crisp.

Drawing these rather than pulling a third tileset was deliberate. The two
character packs sit together; a bright cartoon tileset next to them would have
been the one thing on screen announcing that the art came from three places.

The orb is drawn **white** and tinted at runtime — green, yellow, red by speed
state. That colour shift is the player's main feedback about how much their
greed is paying, so it has to be one sprite and three tints rather than three
files that could drift apart.

### The sky is code, not art

A four-minute day: dawn, morning, midday, dusk, night, and round again, with
stars that fade in, a sun that becomes a crescent moon, and two parallax ridge
layers. It **never resets on death** — coming back to a sky that has moved on is
most of what makes it feel gentle rather than looped.

The palette stays low in saturation on purpose. The orbs are the only thing in
this game allowed to be a strong colour, and a bright blue daytime sky would
have taken that away from them.

---

## Credits

Neither character pack requires attribution, but both appreciate it:

> Character sprites by rvros — *Animated Pixel Adventurer*.
> Monsters by LuizMelo — *Monsters Creatures Fantasy* (CC0).

The original archives and the packs' full `Individual Sprites` folders were
deleted once the game sheets were built. Only the frames this game plays are in
the repository — shipping the frames inside a game is the use both licences
describe; re-publishing the packs is what rvros's forbids.

---

## The two-renderer rule still holds

The rectangle renderer did not go away and is not a stopgap. It is what draws
when a sprite is unavailable, and it is still a complete, fully playable game —
coloured blocks with a one-word label (`block`, `spike`, `beam`, `mark`, `bot`,
`brute`), the player as a plain white rectangle, orbs as circles.

It is per-thing, not all-or-nothing: every sprite loads independently, so a
single missing PNG costs that one entity its art and nothing else. Blank a
`sheet` field in `assets/manifest.json` and reload to watch it happen:

```json
"sheet": ""
```

Deleting the whole `assets/` folder sends everything back to rectangles at the
cost of one `404` line in the console from the probe looking for a manifest that
is no longer there. That is a handled miss, not a fault. The day/night sky is
code, so it keeps working either way.

## Manifest format

One entry per animation, because sprite packs disagree about frame size and
speed and a single global frame size is a lie.

```json
{
  "player": {
    "sheet": "assets/adventurer.png",
    "height": 74,
    "animations": {
      "idle":  { "row": 0, "frames": 4, "fps": 8,  "frameWidth": 50, "frameHeight": 37 },
      "run":   { "row": 1, "frames": 6, "fps": 15, "frameWidth": 50, "frameHeight": 37 },
      "slash": { "row": 5, "frames": 5, "fps": 18, "frameWidth": 50, "frameHeight": 37, "loop": false }
    }
  }
}
```

| key | where | meaning |
|---|---|---|
| `sheet` | player | path to the PNG, relative to the HTML. Blank it to force rectangles |
| `height` | player | on-screen height in world units for the whole frame (74 here — an exact 2x of the 37px frame, so the pixels stay square; the collision box stays 26×46 regardless, so this is pure art) |
| `row` | animation | zero-based row on the sheet. Two animations may share a row — `walk` and `run` do |
| `col` | animation | zero-based first column, if the row does not start at 0 (default 0) |
| `frames` | animation | how many frames to play |
| `fps` | animation | playback speed (default 10) |
| `frameWidth`, `frameHeight` | animation | source frame size in pixels |
| `loop` | animation | `false` holds the last frame instead of cycling — used for jump, attacks and death |
| `scale` | animation | multiplies `height` for this animation only, when one row is drawn larger than the rest |
| `offsetX`, `offsetY` | animation | nudge in world units, for rows whose art sits off-centre in its cell |

Names the game asks for: `idle`, `walk`, `run`, `jump`, `fall`, `slide`,
`slash`, `shoot`, `death`.

**You do not have to supply all nine.** Missing ones fall back automatically:
`run→walk`, `walk→run`, `fall→jump`, `jump→fall`, `slide→crouch`,
`shoot→slash`, `slash→attack`, `death→hurt`, and anything still unresolved
falls back to `idle`. A manifest with nothing but `idle` in it is valid and will
animate — badly, but without a single error.

---

## The entity section

Entities take one looping animation each, plus how to anchor it:

```json
"entities": {
  "enemySword": { "sheet": "assets/skeleton.png", "frames": 4, "fps": 5,
                  "frameWidth": 45, "frameHeight": 51, "height": 68, "anchor": "bottom" },
  "block":      { "sheet": "assets/obj-block.png", "frames": 1, "fps": 1,
                  "frameWidth": 34, "frameHeight": 26, "anchor": "box" },
  "orb":        { "sheet": "assets/obj-orb.png", "frames": 1, "fps": 1,
                  "frameWidth": 18, "frameHeight": 18, "height": 22,
                  "anchor": "center", "tint": true }
}
```

| anchor | meaning |
|---|---|
| `box` | stretched to the entity's rect. Obstacles are authored at their exact size, so this is 1:1 |
| `bottom` | bottom-centred on the entity, scaled to `height`. For anything standing on the ground |
| `center` | centred on the entity, scaled to `height`. For anything floating |

`tint: true` multiplies the sprite into the current orb colour and caches the
result per colour. Keys the game looks for: `enemyGun`, `enemyGun2`,
`enemySword`, `target`, `orb`, `bullet`, `block`, `spike`, `beam`, `gate`.
Obstacles are keyed by their **shape**, not by `obstacle`.

`ground.strip` is tiled along the top of every ground span from a fixed world
origin, so the texture stays put in the world instead of sliding under the
player; `ground.ledge` caps each end, mirrored on the right.

---

## Swapping in a different character

1. Drop the new sheet into `assets/`.
2. Point `sheet` at it and correct each `row`, `frames`, `frameWidth` and
   `frameHeight`. Per-animation frame sizes mean a borrowed row from another
   pack works without reprocessing the sheet.
3. Reload. No code changes anywhere.

If a row index is wrong you will see it immediately — the character plays the
wrong animation rather than failing. Open the debug HUD (small dot, top right)
to read the current action while you correct the rows.
