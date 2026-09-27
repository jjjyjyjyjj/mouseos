import { windowRects, type WinRect } from '../os/windows'
import { clamp, dist, rand, v, type Vec } from './motion'
import { anim, canStandAt, coast, fleeFrom, held, say, snap, walkTo, type Routine } from './steps'
import type { Behavior } from './brain'
import type { World } from './world'

/**
 * Each behavior bids with score() and plays out as a generator.
 * Adding a new reaction = adding one object to the array at the bottom.
 */

const Loaf: Behavior = {
  id: 'loaf',
  priority: 10,
  score: () => 0.2,
  *run(): Routine {
    yield anim('idle', rand(1200, 3000))
    yield anim('sniff', rand(500, 900))
  },
}

const Wander: Behavior = {
  id: 'wander',
  priority: 10,
  score: (w) => (w.drives.fear < 0.2 ? 0.26 : 0),
  *run(w): Routine {
    yield anim('sniff', 400)
    yield walkTo(v(rand(80, w.bounds.w - 80), rand(120, w.bounds.h - 140)))
    yield anim('idle', rand(400, 1400))
  },
}

/**
 * The headline reaction. She bolts, and if there's a window nearby she slots
 * herself UNDERNEATH it in the stacking order and cowers there.
 */
const Flee: Behavior = {
  id: 'flee',
  priority: 80,
  score: (w) => (w.drives.fear > 0.32 ? 0.6 + w.drives.fear : 0),
  *run(w): Routine {
    // The startle frame carries its own "!", so no speech bubble on top of it.
    yield anim('startle', 600)
    yield fleeFrom((ww) => ww.cursor, 420)

    // Bolting is all this does. Where she goes to ground is a separate
    // behaviour -- and only worth handing off to if somewhere exists.
    w.pendingHide = screenIsCovered(w) || findHideout(w) !== null
    if (!w.pendingHide) {
      yield fleeFrom((ww) => ww.cursor, 500)
      yield anim('startle', 900)
      w.drives.habituation = clamp(w.drives.habituation + 0.1, 0, 1)
    }
    w.drives.fear *= 0.3
  },
}

/**
 * Gone to ground against a window edge. Takes over from Flee once she's run.
 */
const HideAtWindow: Behavior = {
  id: 'hide-window',
  priority: 85,
  score: (w) => (w.pendingHide && !screenIsCovered(w) && findHideout(w) ? 8 : 0),
  *run(w): Routine {
    w.pendingHide = false
    const hideout = findHideout(w)
    if (!hideout) return

    yield walkTo(hideout.point, { speed: 460, anim: 'run', tol: 22 })
    yield snap(hideout.point)
    // She stays on top. The occlusion is drawn into the frames, so putting her
    // behind the window buys nothing -- and it used to drag her under the
    // window's drop shadow, which washed the visible sliver out to nothing.
    yield anim(hideout.anim, rand(1800, 3400))
    // She habituates: a cursor that chases but never hurts gets less scary.
    w.drives.habituation = clamp(w.drives.habituation + 0.18, 0, 1)
    yield anim('idle', 700)
  },
}

/**
 * A window filling the screen leaves no edge to hide behind, so she throws
 * something over herself where she stands and holds still under it.
 */
const HideUnderSheet: Behavior = {
  id: 'hide-sheet',
  priority: 85,
  score: (w) => (w.pendingHide && screenIsCovered(w) ? 8 : 0),
  *run(w): Routine {
    w.pendingHide = false
    yield anim('hideFull', rand(2600, 4200))
    w.drives.habituation = clamp(w.drives.habituation + 0.18, 0, 1)
    yield anim('idle', 600)
  },
}

/**
 * The two hiding frames have their occlusion drawn in: hide/1 is cut off at the
 * canvas's left edge, hide/2 at its bottom edge. So placing her is a matter of
 * lining a canvas edge up with a window edge -- which is also why this works on
 * a real desktop, where we can't put her behind anyone else's window.
 */
/** hide/1: she's flush to the canvas's left edge, feet 86% of the way down. */
const HIDE_SIDE_FOOT = 329 / 384
/** How much she'll detour to put distance between a hiding place and the cursor. */
const CURSOR_AVOIDANCE = 0.4

interface Hideout {
  windowId: string
  point: Vec
  anim: string
}

function hideoutsFor(w: World, id: string, r: WinRect): Hideout[] {
  const half = w.spriteHalf
  const size = half * 2
  // Her drawn canvas isn't centred on her logical position, so every edge
  // alignment below is solved for the canvas, then converted back.
  const dy = w.spriteCenterDy
  const out: Hideout[] = []
  const feetY = r.bottom - (HIDE_SIDE_FOOT - 0.5) * size - dy

  // Standing just past the window's right edge, her left half behind it.
  out.push({ windowId: id, anim: 'hideSide', point: v(r.right + half, feetY) })

  // The same frame mirrored, against the left edge, so she never has to cross
  // the screen to reach the only side she can hide on.
  out.push({ windowId: id, anim: 'hideSideLeft', point: v(r.left - half, feetY) })

  // Peeking over the top edge, everything below it hidden.
  if (r.top > half * 0.8) {
    out.push({
      windowId: id,
      anim: 'hideTop',
      point: v(
        clamp(r.left + r.width * rand(0.3, 0.7), r.left + half * 0.6, r.right - half * 0.6),
        r.top - half - dy,
      ),
    })
  }
  return out
}

/**
 * She hides against the frontmost window she can actually reach.
 *
 * Not the nearest one: the overlay draws her above everything, so hiding
 * against a window that something else covers would leave her floating on top
 * of whatever is in front of it. Only the window on top is safe. Windows
 * arrive front-to-back, so this takes the first that offers a usable spot.
 */
/**
 * True when the frontmost window covers essentially the whole screen. Only the
 * front one counts -- a fullscreen window behind a small one isn't in the way.
 */
function screenIsCovered(w: World): boolean {
  const front = windowRects()[0]
  if (!front) return false
  return front.width >= w.bounds.w * 0.95 && front.height >= w.bounds.h * 0.95
}

function findHideout(w: World): Hideout | null {
  // Nothing behind a fullscreen window is reachable, and its own edges are off
  // screen, so there is no hiding place at all.
  if (screenIsCovered(w)) return null

  for (const r of windowRects()) {
    if (r.width < 80) continue

    let best: Hideout | null = null
    let bestScore = -Infinity

    for (const spot of hideoutsFor(w, r.id, r)) {
      // Must be somewhere integrate will actually leave her. A spot outside
      // this gets clamped on arrival, and the drawn edge silently stops
      // meeting the window edge.
      if (!canStandAt(w, spot.point)) continue
      // Nearest hiding place wins, so she ducks behind the edge she's already
      // next to instead of sprinting past the window to the far side. The
      // cursor term only breaks ties away from whatever is chasing her.
      const s = CURSOR_AVOIDANCE * dist(spot.point, w.cursor) - dist(spot.point, w.critter.pos)
      if (s > bestScore) {
        bestScore = s
        best = spot
      }
    }

    if (best) return best
  }
  return null
}

/** Cursor sits still long enough and she comes to investigate. */
const Curious: Behavior = {
  id: 'curious',
  priority: 30,
  score: (w) => (w.drives.curiosity > 0.55 && w.cursorDist > 120 ? 0.35 + w.drives.curiosity * 0.4 : 0),
  *run(w): Routine {
    yield anim('perk', 450)
    yield walkTo(
      (ww) => {
        const dx = ww.critter.pos.x - ww.cursor.x
        const dy = ww.critter.pos.y - ww.cursor.y
        const d = Math.hypot(dx, dy) || 1
        return v(ww.cursor.x + (dx / d) * 70, ww.cursor.y + (dy / d) * 70)
      },
      { speed: 150, tol: 22 },
    )
    yield anim('sniff', 1100)
    yield say('?', 800)
    w.drives.curiosity = 0
    yield anim('idle', 600)
  },
}

/** Poke her enough times in a short window and she loses it. */
const Annoyed: Behavior = {
  id: 'annoyed',
  priority: 95,
  score: (w) => (w.drives.annoy > 0.62 ? 1.4 + w.drives.annoy : 0),
  *run(w): Routine {
    // The angry drawings carry their own "!" and anger mark, so no speech
    // bubble -- it would just say the same thing twice.
    yield anim('angry', 1000)
    // Charges the cursor instead of running from it.
    yield walkTo((ww) => ww.cursor, { speed: 380, tol: 34, anim: 'run' })
    yield anim('angry', 1200)
    w.drives.annoy = 0
    w.drives.fear = 0
    yield anim('idle', 500)
  },
}

/** 30 seconds of nothing and out comes the pillow. */
const Nap: Behavior = {
  id: 'nap',
  priority: 20,
  score: (w) => (w.drives.sleep > 0.55 ? 0.8 + w.drives.sleep * 0.3 : 0),
  *run(w): Routine {
    yield anim('yawn', 900)
    const corner = v(w.bounds.w - rand(120, 220), w.bounds.h - rand(140, 200))
    yield walkTo(corner, { speed: 110, tol: 20 })
    yield anim('curl', 800)
    yield say('z', 2600)
    yield say('z z', 2600)
    yield say('z z z', 3200)
  },
  exit(w) {
    w.drives.sleep = 0
  },
}

/**
 * Picked up by the pointer. Outranks everything -- whatever she was doing, she
 * is now dangling from your cursor.
 */
const Dragged: Behavior = {
  id: 'dragged',
  priority: 200,
  score: (w) => (w.held ? 10 : 0),
  *run(): Routine {
    yield anim('flail')
    yield say('!', 600)
    yield held()
  },
}

/**
 * Let go of. She carries the throw's momentum, lands, and crumples -- which is
 * what `cower` is for: recovering from being dropped, not hiding from a cursor.
 */
const Dropped: Behavior = {
  id: 'dropped',
  priority: 150,
  // One shot: the flag is consumed as the routine starts, and the priority
  // guard keeps it running to the end rather than re-triggering itself.
  score: (w) => (w.pendingDrop && !w.held ? 9 : 0),
  *run(w): Routine {
    w.pendingDrop = false
    yield anim('flail')
    yield coast(340)
    yield anim('cower', 1500)
    // She holds the flattened pose through this, then picks herself up by
    // simply walking off. No startle at the end -- being dropped is over.
    yield say('...', 800)
    w.drives.fear = 0
    w.drives.habituation = clamp(w.drives.habituation + 0.12, 0, 1)
  },
}

/**
 * Costume table. Adding a reaction to a new app is one line here -- the OS
 * (or, in overlay mode, macOS itself) just reports which app is frontmost.
 */
const APP_MOODS: Record<string, { anim: string; say: string | null }> = {
  spotify: { anim: 'dance', say: '\u266A' },
  vscode: { anim: 'read', say: null },
  terminal: { anim: 'read', say: null },
}

const AppMood: Behavior = {
  id: 'appmood',
  priority: 40,
  score: (w) => (w.focusedApp && APP_MOODS[w.focusedApp] ? 0.55 : 0),
  *run(w): Routine {
    const mood = w.focusedApp ? APP_MOODS[w.focusedApp] : undefined
    if (!mood) return
    yield anim(mood.anim)
    if (mood.say) yield say(mood.say, 1400)
    yield anim(mood.anim, 4200)
  },
}

export const behaviors: Behavior[] = [
  Dragged,
  Dropped,
  HideAtWindow,
  HideUnderSheet,
  Loaf,
  Wander,
  Flee,
  Curious,
  Annoyed,
  Nap,
  AppMood,
]
