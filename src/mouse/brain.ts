import { enterStep, updateStep, type Routine, type Step } from './steps'
import type { World } from './world'

/**
 * Utility-based action selection.
 *
 * Every behavior bids on control each tick; the highest bid wins. This beats a
 * switch statement because behaviors compose: she can be a little sleepy AND
 * mildly curious, and the winner falls out of the numbers instead of a hand-
 * written precedence table.
 */
export interface Behavior {
  id: string
  /** Higher priority may interrupt a running lower-priority behavior. */
  priority: number
  /** 0 = never run me. Otherwise, higher wins. */
  score(w: World): number
  run(w: World): Routine
  /** Called whenever the behavior stops, finished or interrupted. Clean up here. */
  exit?(w: World): void
}

/** The incumbent gets a bonus so she doesn't twitch between two close bids. */
const HYSTERESIS = 0.18
const DECIDE_MS = 100

export class Brain {
  current: Behavior | null = null
  private it: Routine | null = null
  private step: Step | null = null
  private sinceDecision = 0

  constructor(private behaviors: Behavior[]) {}

  get running(): boolean {
    return this.step !== null
  }

  update(w: World, dt: number): void {
    this.sinceDecision += dt * 1000
    if (this.sinceDecision >= DECIDE_MS) {
      this.sinceDecision = 0
      this.decide(w)
    }

    if (this.step && updateStep(this.step, w, dt)) this.advance(w)
    if (!this.step && !this.current) this.decide(w)
  }

  private decide(w: World): void {
    let best: Behavior | null = null
    let bestScore = 0
    for (const b of this.behaviors) {
      let s = b.score(w)
      if (s <= 0) continue
      if (b === this.current) s += HYSTERESIS
      if (s > bestScore) {
        bestScore = s
        best = b
      }
    }
    if (!best || best === this.current) return

    // Only interrupt mid-routine if the challenger actually outranks her.
    if (this.running && this.current && best.priority <= this.current.priority) return

    this.stop(w)
    this.current = best
    this.it = best.run(w)
    this.advance(w)
  }

  private stop(w: World): void {
    this.current?.exit?.(w)
    w.critter.say = null
    this.current = null
    this.it = null
    this.step = null
  }

  private advance(w: World): void {
    const r = this.it?.next()
    if (!r || r.done) {
      this.stop(w)
      return
    }
    this.step = r.value
    enterStep(this.step, w)
  }
}
