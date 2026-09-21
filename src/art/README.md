# Her drawings

```
art-source/          <- exports go here, full size, straight from Procreate
  idle/   1.png 2.png 3.png 4.png
  walk/   1.png 2.png
  run/    1.png 2.png
  cower/  1.png 2.png 3.png

src/art/             <- generated: the same frames, resized to 384px
  frames.json        <- hand-written, optional
```

One folder per animation, numbered frames inside. Drop new exports into
`art-source/` and run:

```bash
npm run art:prep
```

`dev`, `build` and `overlay` all run it first, so usually you just export and
launch. It only touches frames whose source is newer, and never modifies the
originals.

**Why the resize step:** Procreate exports at canvas resolution. A 2048px frame
is ~16MB of texture memory once decoded, so a dozen of them in an always-on
overlay would sit on hundreds of megabytes. At 384px the whole set is ~300KB and
still has retina headroom. Raise it with `ART_MAX=512 npm run art:prep` if she
ever looks soft.

The console confirms what loaded:
`[mouseos] drawing from src/art/ frame folders: cower(3) idle(4) run(2) walk(2)`.

Frames sort naturally, so `10.png` comes after `9.png`, not after `1.png`.
Procreate's own layer names (`Layer 1.png`, `Layer 2.png`…) work unchanged.

### From Procreate

One canvas per animation, Animation Assist on, **one layer per frame**, then
`Share → Layers → PNG files`. Unzip into the matching folder under
`art-source/`.

If you use frame *groups*, flatten them first — that export writes individual
layers, not composited frames.

**Don't export GIF.** GIF transparency is 1-bit, so her antialiased lines get a
hard halo against whatever's behind her on the desktop. And a GIF runs on its
own clock with no way to seek from code, which breaks holding the last frame and
any sync with what she's actually doing.

### src/art/frames.json

Every field has a working default; the file can be deleted entirely.

```json
{
  "facing": "left",
  "scale": 0.4,
  "fps": 8,
  "alias": { "idle": "walk#1", "curl": "idle", "peek": "cower#1" },
  "anims": {
    "run":   { "fps": 12 },
    "cower": { "fps": 5, "loop": false },
    "curl":  { "fps": 2, "offset": [0, -12] }
  }
}
```

- `facing` — which way the drawings point, so the mirror goes the right way.
  Hers face left; the default is `"right"`.
- `scale` — how big she is on screen. `0.4` of a 384px frame puts her at about
  120px tall.
- `alias` — reuse one folder for another animation. `"walk#1"` pins a single
  frame, which is how a standing pose becomes the idle.
- `loop: false` — hold the last frame. Right for `cower`, `curl` and `peek`,
  which are arrivals rather than idles.
- `offset: [x, y]` — nudge one animation in source pixels, to line its feet up
  with the others without redrawing.

**An animation with no art is never invisible.** It follows its alias, then
falls back to `idle`, then to whatever folder exists. Draw four and the other
nine borrow.

## One packed sheet (later, if you want it)

`mouse.png` + `mouse.json` in this folder, one animation per row, uniform cells.
Fewer files; needs a packing step every time you redraw. Only worth it if the
frame count gets large. Format is `AtlasDef` in
[../mouse/sprite.ts](../mouse/sprite.ts).

## What to draw

A missing animation falls back to `idle`, so ship four folders and add the rest
whenever.

She's in `idle`, `walk`, `run` or `cower` maybe 80% of the time — draw those
four first and she'll already feel finished. Then: `flail` `sniff` `perk`
`startle` `curl` `yawn` `angry` `stomp` `peek` `dance` `read`.

`cower` is what she does after being **dropped**, not when she's chased — she
stays on her feet when the cursor comes at her. `flail` is her dangling from the
pointer while held; it borrows `cower#2`, the small hunched frame.

`startle` is the split second she notices something — it borrows `angry#1`, the
red `!`. `perk` is the calmer "ears up" beat when she gets curious, so it stays
on a neutral standing frame; an alarm mark reads wrong there.

## Two things worth doing

**Animate on twos, around 10fps.** Choppy reads as hand-drawn rather than cheap,
and it's a third of the work. `run` is the one worth a faster `fps`.

**Keep her in the same spot in every frame.** If she drifts around inside the
canvas she'll jitter on screen — the frame is the rig. Same canvas size for
every animation.

**Costumes are layers, not new cycles.** Glasses over one walk cycle is two
drawings. Redrawing every cycle in every outfit is combinatorial and will bury
you around outfit three.
