# MouseOS

One small mouse, living on your desktop.

```bash
npm install
npm run overlay     # she runs loose on your real macOS desktop
npm run dev         # development only: a fake desktop in the browser
```

`npm run dev` opens a *simulated* desktop in a browser tab. It exists to build
and test behaviours with devtools open, and never appears on a real screen — if
the app ever starts without its system bridge it reports the failure rather than
painting a fake computer over your actual one.

Then: move the cursor at her, leave her alone, click her four times fast, or walk
away for 30 seconds. Press **D** for the drives HUD.

**Pick her up.** Press and drag and she dangles from the pointer, flailing. Let
go mid-swing and she keeps the throw's momentum, sails, lands and crumples
before picking herself up. A press that *doesn't* travel is still just a poke,
so clicking her repeatedly still makes her furious.

## Turning her off

She lives in the **menu bar**, not the Dock. Click the mouse-head icon:

- **Mouse on screen** — the switch. Off hides the window, stops every OS poll
  *and* stops the animation loop, so a disabled mouse costs nothing at all. The
  setting is remembered between launches.
- **Open at login** — start her with the machine.
- **Quit MouseOS**.

**Ctrl+Alt+M** toggles her from anywhere.

## Overlay mode

A transparent, click-through, always-on-top window stretched over your work area
([electron/main.cjs](electron/main.cjs)). You keep using your computer straight
through her; the overlay only stops ignoring the mouse when the pointer is
actually on top of her, which is what makes clicking her possible.

Everything she perceives is pulled from the OS, because a click-through window
receives no input of its own:

| sense | source |
| --- | --- |
| cursor | `screen.getCursorScreenPoint()`, polled at 60Hz |
| idleness | `powerMonitor.getSystemIdleTime()` — *real* system idle, so the nap means you actually left |
| frontmost app | `osascript`, polled — needs Accessibility permission; without it she just never gets costumes |
| everyone else's windows | `CGWindowListCopyWindowInfo` via [tools/window-list.swift](tools/window-list.swift) — **no permission prompt**, because only window *titles* need Screen Recording and we never ask for them |

Open Spotify and she dances. Open VS Code and she puts on glasses. That table is
`APP_MOODS` in [behaviors.ts](src/mouse/behaviors.ts) — one line per app.

`npm run overlay:dev` attaches the overlay to a running `npm run dev` server for
live reload. `npx electron . --probe` prints her live state to the terminal,
which is the only way to inspect a window you can't click into.

### Hiding against real windows

An always-on-top overlay can never truly sit *behind* another app's window — so
it doesn't try. The hiding frames have their occlusion drawn in (`hide/1` is cut
off at the canvas's left edge, `hide/2` at its bottom), and she lines a drawn
edge up with a real window edge. The illusion is identical and needs no
z-ordering at all.

`npm run overlay` compiles the helper on demand. Without a Swift toolchain it
warns and she simply never finds a hiding place.

### Not yet real on the desktop

- **Carrying files** needs a `CGEventTap` to see drags that aren't aimed at our
  window, plus Finder scripting to know what's being dragged. That's the one
  feature that gets meaningfully harder outside the browser.

## The one rule

**The desktop never talks to the mouse.** It emits semantic events (`src/bus.ts`)
and the mouse decides what she cares about. This is what made the jump from a
web page to your real desktop cheap: [os/native.ts](src/os/native.ts) emits the
same `cursor.move` / `app.open` events from macOS, and not one line of the brain
changed. Adding "open Figma → she picks up a
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

Drop a folder of numbered PNG frames per animation into [src/art/](src/art/) —
`src/art/walk/1.png`, `2.png`, … — and she switches over automatically, no code
change and no packing step. It's shaped around Procreate's
`Share → Layers → PNG files`. A packed sprite sheet works too.

**[src/art/README.md](src/art/README.md) has the full format**, the animation
list, and what to draw first.

The art is bundled at build time rather than fetched at runtime, because the
overlay runs over `file://` where `fetch()` is blocked. Console says which
renderer is live, and warns loudly if the sheet's grid doesn't match the JSON.

## Next: the carry

`os/desktop.ts` already splits drop **intent** from **commit**. `commitDrop()` is
exported and currently fires immediately on pointerup. Step 3 is:

1. On `file.dragstart`, a `CarryFile` behavior bids high.
2. She runs over; on contact the icon reparents from the cursor to her hand anchor.
3. `file.drop` records where you *wanted* it.
4. She struggles over and calls `commitDrop()` **when she arrives**.

Keep a bail-out (drag fast, or double-click) so the user always wins within
~1.5s. Cute-but-obstructive is the failure mode that kills desktop pets.
