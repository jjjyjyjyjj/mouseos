# Put her drawings here

Two ways in. **Use folders** — it's the one that matches how Procreate exports.

## Folders of frames (recommended)

One folder per animation, numbered frames inside:

```
src/art/
  idle/   1.png 2.png 3.png 4.png
  walk/   1.png 2.png … 10.png
  run/    1.png …
  cower/  1.png 2.png
```

That's it. No packing step, no JSON to hand-write. The console confirms what it
found: `[mouseos] drawing from src/art/ frame folders: idle(4) walk(10)`.

Frames sort naturally, so `10.png` comes after `9.png`, not after `1.png`.
Procreate's own layer names (`Layer 1.png`, `Layer 2.png`…) work unchanged.

### From Procreate

One canvas per animation, Animation Assist on, **one layer per frame**, then
`Share → Layers → PNG files`. Unzip into the matching folder.

If you use frame *groups*, flatten them first — that export writes individual
layers, not composited frames.

**Don't export GIF.** GIF transparency is 1-bit, so her antialiased lines get a
hard halo against whatever's behind her on the desktop. And a GIF runs on its
own clock with no way to seek from code, which breaks holding the last frame and
any sync with what she's actually doing.

### src/art/frames.json (optional)

Every field has a working default; the file can be skipped entirely.

```json
{
  "fps": 10,
  "scale": 0.5,
  "anims": {
    "run":  { "fps": 14 },
    "curl": { "loop": false },
    "yawn": { "loop": false },
    "peek": { "loop": false }
  }
}
```

- `scale` — draw big, display small. Export at 192px and set `0.5` for a crisp
  sprite on retina.
- `loop: false` — hold the last frame. Right for `curl`, `yawn` and `peek`,
  which are arrivals, not idles.

## One packed sheet (later, if you want it)

`mouse.png` + `mouse.json` in this folder, one animation per row, uniform cells.
Fewer files; needs a packing step every time you redraw. Only worth it if the
frame count gets large. Format is `AtlasDef` in
[../mouse/sprite.ts](../mouse/sprite.ts).

## What to draw

A missing animation falls back to `idle`, so ship four folders and add the rest
whenever.

She's in `idle`, `walk`, `run` or `cower` maybe 80% of the time — draw those
four first and she'll already feel finished. Then: `sniff` `perk` `curl` `yawn`
`angry` `stomp` `peek` `dance` `read`.

## Two things worth doing

**Animate on twos, around 10fps.** Choppy reads as hand-drawn rather than cheap,
and it's a third of the work. `run` is the one worth a faster `fps`.

**Keep her in the same spot in every frame.** If she drifts around inside the
canvas she'll jitter on screen — the frame is the rig. Same canvas size for
every animation.

**Costumes are layers, not new cycles.** Glasses over one walk cycle is two
drawings. Redrawing every cycle in every outfit is combinatorial and will bury
you around outfit three.
