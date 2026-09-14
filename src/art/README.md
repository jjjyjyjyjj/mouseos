# Put her drawings here

Two files, and she stops being a placeholder:

```
src/art/mouse.png     one sheet, transparent background
src/art/mouse.json    what's in it
```

Nothing else changes. `sprite.ts` finds them at build time and switches over —
you'll see `[mouseos] drawing from ../art/mouse.json` in the console.

## The sheet

A uniform grid. **One animation per row**, frames left to right, no padding, no
trimming, every cell the same size. Rows may have different frame counts; the
sheet is just as wide as the longest row.

Keep her in the same spot in every cell — if she jumps around inside the frame,
she'll jitter on screen. The grid is the rig.

## mouse.json

```json
{
  "image": "mouse.png",
  "frameW": 192,
  "frameH": 192,
  "scale": 0.5,
  "fps": 10,

  "anims": {
    "idle":  { "row": 0,  "count": 4 },
    "walk":  { "row": 1,  "count": 6 },
    "run":   { "row": 2,  "count": 6, "fps": 14 },
    "sniff": { "row": 3,  "count": 4 },
    "perk":  { "row": 4,  "count": 2 },
    "cower": { "row": 5,  "count": 2 },
    "peek":  { "row": 6,  "count": 2, "loop": false },
    "angry": { "row": 7,  "count": 4, "fps": 16 },
    "stomp": { "row": 8,  "count": 4 },
    "yawn":  { "row": 9,  "count": 3, "loop": false },
    "curl":  { "row": 10, "count": 2, "loop": false },
    "dance": { "row": 11, "count": 6 },
    "read":  { "row": 12, "count": 2 }
  }
}
```

- `scale` — draw big, display small. At `frameW: 192, scale: 0.5` she renders
  96px and stays crisp on a retina screen.
- `fps` — per-animation override of the top-level default.
- `loop: false` — hold the last frame instead of cycling. Right for `curl`,
  `yawn` and `peek`, which are arrivals, not idles.
- A missing animation silently falls back to `idle`, so you can ship four rows
  and add the rest later.

## Drawing order

She is on screen in `idle`, `walk`, `run` and `cower` maybe 80% of the time.
Draw those four first and she'll already feel finished.

Then: `sniff` `perk` `curl` `yawn` `angry` `stomp` `peek` `dance` `read`.

## Two things worth doing

**Animate on twos, around 10fps.** Choppy reads as hand-drawn rather than cheap,
and it's a third of the work. `run` is the one worth a faster `fps`.

**Costumes are layers, not new cycles.** Glasses and a garbage-worker hat over
one walk cycle is two drawings. Redrawing every cycle in every outfit is
combinatorial and will bury you. `anchors` in `AtlasDef` is where per-frame
attach points go when you get to that — the same mechanism carries a file icon
in her paws.
