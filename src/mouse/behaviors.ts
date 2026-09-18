import { allWindowIds } from '../os/desktop'
import { MOUSE_LAYER, zorder } from '../os/zorder'
import { clamp, dist, rand, v, type Vec } from './motion'
import { anim, coast, fleeFrom, held, say, walkTo, type Routine } from './steps'
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
    yield anim('perk')
    yield say('!', 600)
    yield fleeFrom((ww) => ww.cursor, 420)

    const hideout = findHideout(w)
    if (hideout) {
      yield walkTo(hideout.point, { speed: 460, anim: 'run', tol: 24 })
      zorder.putBelow(MOUSE_LAYER, hideout.windowId)
      w.critter.hidingBehind = hideout.windowId
      yield anim('perk', rand(1400, 2600))
      // She habituates: a cursor that chases but never hurts gets less scary.
      w.drives.habituation = clamp(w.drives.habituation + 0.18, 0, 1)
      yield anim('idle', 700)
    } else {
      yield fleeFrom((ww) => ww.cursor, 500)
      yield anim('perk', 900)
      w.drives.habituation = clamp(w.drives.habituation + 0.1, 0, 1)
    }
    w.drives.fear *= 0.3
  },
  exit(w) {
    if (w.critter.hidingBehind) {
      zorder.raise(MOUSE_LAYER)
      w.critter.hidingBehind = null
    }
  },
}

function findHideout(w: World): { windowId: string; point: Vec } | null {
  let best: { windowId: string; point: Vec } | null = null
  let bestScore = -Infinity
  for (const id of allWindowIds()) {
    const r = zorder.rectOf(id)
    if (!r || r.width < 80) continue
    const point = v(r.left + r.width / 2, r.top + r.height * 0.7)
    // Prefer hideouts that are close to her but far from the cursor.
    const s = dist(point, w.cursor) * 1.4 - dist(point, w.critter.pos)
    if (s > bestScore) {
      bestScore = s
      best = { windowId: id, point }
    }
  }
  return best
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
    yield say('...', 800)
    w.drives.fear = 0
    w.drives.habituation = clamp(w.drives.habituation + 0.12, 0, 1)
    yield anim('perk', 500)
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

export const behaviors: Behavior[] = [Dragged, Dropped, Loaf, Wander, Flee, Curious, Annoyed, Nap, AppMood]
