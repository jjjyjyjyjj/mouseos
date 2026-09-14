# MouseOS

A desktop environment inhabited by one small mouse.

```bash
npm install
npm run dev
```

Then: move the cursor at her, leave her alone, click her four times fast, or walk
away for 30 seconds. Press **D** for the drives HUD.

## The one rule

**The desktop never talks to the mouse.** It emits semantic events (`src/bus.ts`)
and the mouse decides what she cares about. Adding "open Figma → she picks up a
pen" is a new `Behavior` object, not a change to OS code.

```
os/*  ──emit──▶  bus  ──▶  mouse/world (perception + drives)
                               │
                               ▼
                          mouse/brain (utility scoring)
                               │
                               ▼
                       mouse/behaviors (generators)
                               │
                               ▼
                          mouse/sprite (DOM/SVG)
```

## Why she's a DOM element, not a canvas

A canvas overlay can only ever be on top. She needs to scurry *behind* a window
and hide there, so she lives in the same stacking order as the windows
(`src/os/zorder.ts`). `zorder.putBelow(MOUSE_LAYER, windowId)` is the whole trick.

## The brain

Behaviors **bid** for control every 100ms; the highest score wins, with a
hysteresis bonus for the incumbent so she doesn't twitch. `priority` decides who
may interrupt whom mid-routine.

Each behavior is a **generator**, so it reads as a linear script while staying
interruptible at any yield:

```ts
*run(w) {
  yield anim('perk')
  yield say('!', 600)
  yield fleeFrom(ww => ww.cursor, 420)
  yield walkTo(hideout, { speed: 460, anim: 'run' })
  yield anim('cower', 2000)
}
```

The personality lives in `world.ts`'s **drives** — continuous values that decay.
That's what makes her a creature instead of a trigger list: the 4th rapid click
enrages her, one click a minute doesn't. `habituation` means a cursor that chases
her but never hurts her gradually stops being frightening.

## Swapping in the real drawings

`sprite.ts` picks `AtlasSprite` automatically if `public/mouse.json` exists:

```json
{
  "image": "/mouse.png",
  "frameW": 96, "frameH": 96, "fps": 10,
  "anims": {
    "idle":  { "row": 0, "count": 4 },
    "walk":  { "row": 1, "count": 6 },
    "run":   { "row": 2, "count": 6 },
    "cower": { "row": 3, "count": 2 },
    "curl":  { "row": 4, "count": 2, "loop": false }
  },
  "anchors": { "walk": { "handR": [[70,52],[71,50]] } }
}
```

Draw on twos (~10fps). Choppy reads as hand-drawn *and* costs a third of the
frames. Costumes (glasses, hard hat) should be separate layers pinned to
`anchors`, not redrawn cycles — otherwise it's combinatorial.

Animation names currently used: `idle walk run sniff perk cower peek angry
stomp yawn curl`.

## Next: the carry

`os/desktop.ts` already splits drop **intent** from **commit**. `commitDrop()` is
exported and currently fires immediately on pointerup. Step 3 is:

1. On `file.dragstart`, a `CarryFile` behavior bids high.
2. She runs over; on contact the icon reparents from the cursor to her hand anchor.
3. `file.drop` records where you *wanted* it.
4. She struggles over and calls `commitDrop()` **when she arrives**.

Keep a bail-out (drag fast, or double-click) so the user always wins within
~1.5s. Cute-but-obstructive is the failure mode that kills desktop pets.
