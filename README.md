# MouseOS
A mouse, living on your desktop.

```bash
npm install
npm run overlay     # she runs loose on your real macOS desktop
npm run dev         # development only: a fake desktop in a browser tab
```

Move the cursor towards her, leave her alone, click her four times fast, or walk away
for 30 seconds. **Pick her up** — press and drag and she dangles, flailing; let
go mid-swing and she keeps the throw's momentum. Clicking her repeatedly
still makes her furious.

`npm run dev` is a simulated desktop for building behaviours with devtools open.
It can never reach a real screen: without its system bridge the app reports the
failure rather than painting a fake computer over your actual one.

## Turning her off

She lives in the **menu bar**, not the Dock. **Mouse on screen** is the switch —
off hides the window, stops every OS poll *and* stops the animation loop, so a
disabled mouse costs nothing. The setting persists. There's also **Open at
login** and **Quit**. **Ctrl+Alt+M** toggles her from anywhere.

## Overlay mode

A transparent, click-through, always-on-top window over your work area
([electron/main.cjs](electron/main.cjs)). You work straight through her; the
overlay stops ignoring the pointer only where she's standing, which is what
makes clicking and grabbing her possible.

A click-through window receives no input of its own, so everything she perceives
is pulled from the OS:

| sense | source |
| --- | --- |
| cursor | `screen.getCursorScreenPoint()`, 60Hz |
| idleness | `powerMonitor.getSystemIdleTime()` — *real* system idle, so the nap means you left |
| frontmost app | `osascript` — needs Accessibility; without it she just never gets costumes |
| other apps' windows | `CGWindowListCopyWindowInfo` via [tools/window-list.swift](tools/window-list.swift) — **no permission prompt**; only window *titles* need Screen Recording, and we never ask |

Open Spotify and she dances; open VS Code and she puts on glasses. That's
`APP_MOODS` in [behaviors.ts](src/mouse/behaviors.ts), one line per app.

`npx electron . --probe` prints her live state to the terminal — the only way to
inspect a window you can't click into.

### Hiding

An always-on-top overlay can never sit *behind* another app's window, so it
doesn't try. The hiding frames have their occlusion drawn in (`hide/1` is cut off
at the canvas's left edge, `hide/2` at its bottom) and she lines a drawn edge up
with a real window edge. Same illusion, no z-ordering.

She picks the **frontmost** window she can reach, not the nearest — hiding
against a covered window would leave her floating on top of whatever is in front
of it. If the front one offers nowhere to stand, she falls through to the next.

`npm run overlay` compiles the Swift helper on demand. Without a toolchain she
simply never finds a hiding place.

## What she can see

She reads four things from the system, continuously, and **sends none of them
anywhere**. There is no network code in this app at all — no telemetry, no
analytics, no update check.

| what | why |
| --- | --- |
| cursor position | so she can be frightened of it, curious about it, and dodge it |
| how long since it moved | she settles after 15s, sleeps after 30s |
| which app is frontmost | costumes — she dances for Spotify, wears glasses for VS Code |
| other windows' positions and sizes | so she can hide against a window edge |

macOS will ask once for permission to **control System Events**. That is the
app-name check and nothing else — it's the only thing here that needs a
permission, and declining costs you only the costumes. Window positions come
from `CGWindowListCopyWindowInfo`, which needs no permission because we never
ask for window *titles*, only geometry.

Nothing is stored except a two-line settings file in
`~/Library/Application Support/mouseos/`, recording whether she's switched on
and whether she starts at login.

## Known limits

- **macOS only.** The overlay, the window helper and the app detection are all
  platform-specific.
- She lives on whichever screens are attached when she starts, and follows
  monitors being plugged in or unplugged — but a window spanning two displays
  is an awkward thing on macOS and this is the least-tested part.

## The one rule

**The desktop never talks to the mouse.** It emits semantic events
([src/bus.ts](src/bus.ts)) and she decides what she cares about. That's what made
the jump from a web page to the real desktop cheap: [os/native.ts](src/os/native.ts)
emits the same `cursor.move` / `app.open` events from macOS, and not one line of
the brain changed. "Open Figma → she picks up a pen" is a new `Behavior`, not a
change to OS code.

## The brain

Behaviours **bid** for control every 100ms; the highest score wins, with a
hysteresis bonus for the incumbent so she doesn't twitch. `priority` decides who
may interrupt whom mid-routine.

Each is a **generator**, so it reads as a linear script while staying
interruptible at any yield:

```ts
*run(w) {
  yield anim('startle', 600)
  yield fleeFrom(ww => ww.cursor, 420)
  yield walkTo(hideout.point, { speed: 460, anim: 'run' })
  yield snap(hideout.point)
  yield anim(hideout.anim, 2400)
}
```

Personality lives in the **drives** in [world.ts](src/mouse/world.ts) —
continuous values that decay. That's what makes her a creature rather than a
trigger list: the 4th rapid click enrages her, one a minute doesn't.
`habituation` means a cursor that chases but never hurts gradually stops being
frightening.

She's a DOM element rather than a canvas so she can sit inside the sandbox's own
stacking order ([src/os/zorder.ts](src/os/zorder.ts)); a canvas can only ever be
on top.

## Art

Drop numbered PNG frames per animation into `art-source/<anim>/` — straight out
of Procreate's `Share → Layers → PNG files` — and run `npm run art:prep`, which
`dev`, `build` and `overlay` all do for you. She switches over automatically.

**[src/art/README.md](src/art/README.md) has the format**, the animation list and
what to draw first.

## Next: the carry

[os/desktop.ts](src/os/desktop.ts) already splits drop **intent** from
**commit**: `commitDrop()` is exported and currently fires on pointerup. The
plan is that `CarryFile` bids high on `file.dragstart`, the icon reparents from
the cursor to her hands on contact, `file.drop` records where you *wanted* it,
and she calls `commitDrop()` when she arrives. Keep a bail-out so the user always
wins within ~1.5s — cute-but-obstructive is what kills desktop pets.

On the real desktop this also needs a `CGEventTap` to see drags that aren't aimed
at our window, plus Finder scripting to know what's being dragged. It's the one
feature that gets meaningfully harder outside the browser.
