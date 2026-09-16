import { arrive, clamp, dist, flee as fleeVec, steer, v, type Vec } from './motion'
import type { World } from './world'

/**
 * Routine primitives. A behavior is a generator that yields these, so it reads
 * like a linear script -- "walk here, then play this, then wait" -- while the
 * scheduler stays free to abort it mid-yield when something more urgent bids.
 */
export type Step =
  | { kind: 'walkTo'; to: Vec | ((w: World) => Vec); speed?: number; tol?: number; anim?: string; t?: number }
  | { kind: 'fleeFrom'; from: (w: World) => Vec; ms: number; speed?: number; t?: number }
  | { kind: 'anim'; name: string; ms?: number; t?: number }
  | { kind: 'wait'; ms: number; t?: number }
  | { kind: 'say'; text: string | null; ms?: number; t?: number }
  | { kind: 'face'; dir: 1 | -1 }

export type Routine = Generator<Step, void, void>

export const walkTo = (to: Vec | ((w: World) => Vec), opt: { speed?: number; tol?: number; anim?: string } = {}): Step =>
  ({ kind: 'walkTo', to, ...opt })
export const fleeFrom = (from: (w: World) => Vec, ms: number, speed?: number): Step =>
  ({ kind: 'fleeFrom', from, ms, speed })
export const anim = (name: string, ms?: number): Step => ({ kind: 'anim', name, ms })
export const wait = (ms: number): Step => ({ kind: 'wait', ms })
export const say = (text: string | null, ms?: number): Step => ({ kind: 'say', text, ms })

const WALK_SPEED = 190
const RUN_SPEED = 420
const ACCEL = 9

export function enterStep(step: Step, w: World): void {
  if (step.kind !== 'face') step.t = 0
  switch (step.kind) {
    case 'walkTo':
      w.critter.anim = step.anim ?? 'walk'
      break
    case 'fleeFrom':
      w.critter.anim = 'run'
      break
    case 'anim':
      w.critter.anim = step.name
      break
    case 'say':
      w.critter.say = step.text
      break
    case 'face':
      w.critter.facing = step.dir
      break
  }
}

/** Returns true when the step is finished. */
export function updateStep(step: Step, w: World, dt: number): boolean {
  const c = w.critter
  if (step.kind !== 'face') step.t = (step.t ?? 0) + dt * 1000

  switch (step.kind) {
    case 'walkTo': {
      const target = typeof step.to === 'function' ? step.to(w) : step.to
      const speed = step.speed ?? WALK_SPEED
      steer(c.vel, arrive(c.pos, target, speed), ACCEL, dt)
      if (dist(c.pos, target) < (step.tol ?? 14)) {
        c.vel.x = 0
        c.vel.y = 0
        return true
      }
      return (step.t ?? 0) > 6000 // give up rather than hang forever
    }
    case 'fleeFrom': {
      steer(c.vel, fleeVec(c.pos, step.from(w), step.speed ?? RUN_SPEED), ACCEL * 1.6, dt)
      return (step.t ?? 0) >= step.ms
    }
    case 'anim':
      steer(c.vel, v(0, 0), 6, dt)
      return step.ms === undefined || (step.t ?? 0) >= step.ms
    case 'wait':
      steer(c.vel, v(0, 0), 6, dt)
      return (step.t ?? 0) >= step.ms
    case 'say': {
      steer(c.vel, v(0, 0), 3, dt)
      if (step.ms === undefined) return true
      if ((step.t ?? 0) < step.ms) return false
      // Clear our own bubble on the way out, unless a later step replaced it.
      if (c.say === step.text) c.say = null
      return true
    }
    case 'face':
      return true
  }
}

/** Integrate position, keep her on screen, and derive facing from motion. */
export function integrate(w: World, dt: number): void {
  const c = w.critter
  c.pos.x += c.vel.x * dt
  c.pos.y += c.vel.y * dt

  // Margins allow for the drawn sprite being wider than her logical footprint,
  // so she doesn't get clipped against the screen edges.
  const m = 62
  const top = 40
  const bottom = w.bounds.h - 110
  if (c.pos.x < m || c.pos.x > w.bounds.w - m) c.vel.x *= -0.4
  if (c.pos.y < top || c.pos.y > bottom) c.vel.y *= -0.4
  c.pos.x = clamp(c.pos.x, m, w.bounds.w - m)
  c.pos.y = clamp(c.pos.y, top, bottom)

  if (Math.abs(c.vel.x) > 16) c.facing = c.vel.x > 0 ? 1 : -1
}
