# Gesture Runner — art assets

## What is in the game

The character is **rvros — Animated Pixel Adventurer**, wired in and animating.
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

**The pack has no walk cycle.** It is not in the 39 animations and not in the
individual sprites. So walking is the run row played at 9 fps against running's
15 — the same legs, visibly slower. That reads as the state change it is, and
it costs nothing on the sheet.

**Shooting came from the same artist.** The download page carries an
`Adventurer-Bow` add-on, 9 frames of draw-aim-release with the arrow leaving the
bow. It is the same character at the same 50×37, so the ranged attack does not
look borrowed from another pack — which was the thing to avoid. The `shoot`
action timer in the game was lengthened to 0.28 s to let the release play.

`assets/adventurer.png` is **composited by hand from the pack's individual
frames**, one animation per row, in the order the game asks for them: 9 columns
× 8 rows of 50×37. Building it that way instead of mapping rows on the pack's
own sheet means there is nothing to guess and nothing to get wrong. The
original pack is not redistributed here — only the frames this game plays.

Feet land on the ground line with no per-row offsets: the artist kept the
baseline at y=36 in every grounded animation, which is why none were needed.

## Licence

<https://rvros.itch.io/animated-pixel-hero>

Quoted from the page:

> "You can use this asset for personal and commercial purpose. Credit is not
> required but would be appreciated."

and, under what you cannot do:

> "Resell/redistribute this asset."

Modification is explicitly allowed. Price is name-your-own-price with a free
option; it was downloaded through the free path.

Shipping the frames inside a game is the use the licence describes. Reselling
or re-publishing the pack itself is what it forbids, so the original archives
and the full `Individual Sprites` folder were deleted after the sheet was
built, and only the composited game sheet is in the repository.

**Credit line**, since it is appreciated:

> Character sprites by rvros — *Animated Pixel Adventurer*.

---

## What is still procedural

Everything that is not the character: ground, orbs, obstacles, gates, enemies,
targets, bullets and particles are drawn as flat shapes. They read by silhouette
rather than by word — spikes are teeth, a beam hangs with a lit lip underneath,
a gate has bars, a gap is an absence of ground.

That is a coherent look next to the pixel character rather than a hole, but if
you want the world skinned too, **Kenney** is the place: <https://kenney.nl/assets>,
**Creative Commons CC0**, no attribution required, unrestricted. Start with
Particle Pack and Pixel Platformer. Say the word and I will wire them in — it
needs the manifest extended past `player`, which is a real change rather than a
drop-in.

---

## The two-renderer rule still holds

The rectangle renderer did not go away and is not a stopgap. It is what draws
when sprites are unavailable, and it is still fully playable — coloured blocks
with a one-word label, the player as a plain white rectangle.

To see it, blank the `sheet` field in `assets/manifest.json` and reload:

```json
"sheet": ""
```

Deleting the whole `assets/` folder does the same, at the cost of one `404`
line in the console from the probe looking for a manifest that is no longer
there. That is a handled miss, not a fault. Everything else in the game is
identical either way — the renderers share one interface and no game logic
knows which is active.

---

## Manifest format

One entry per animation, because sprite packs disagree about frame size and
speed and a single global frame size is a lie.

```json
{
  "player": {
    "sheet": "assets/adventurer.png",
    "height": 72,
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
| `height` | player | on-screen height in world units for the whole frame (72 here; the collision box stays 26×46 regardless, so this is pure art) |
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

## Swapping in a different character

1. Drop the new sheet into `assets/`.
2. Point `sheet` at it and correct each `row`, `frames`, `frameWidth` and
   `frameHeight`. Per-animation frame sizes mean a borrowed row from another
   pack works without reprocessing the sheet.
3. Reload. No code changes anywhere.

If a row index is wrong you will see it immediately — the character plays the
wrong animation rather than failing. Open the debug HUD (small dot, top right)
to read the current action while you correct the rows.
