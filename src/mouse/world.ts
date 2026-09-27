import { bus } from '../bus'
import { clamp, dist, v, type Vec } from './motion'

export interface Critter {
  pos: Vec
  vel: Vec
  facing: 1 | -1
  anim: string
  say: string | null
  /** Exempt from the roaming margins -- she's tucked against a screen edge. */
  anchored: boolean
}

/**
 * Drives are the whole personality. They are continuous and they DECAY, which
 * is what separates a creature from a trigger list: the 4th rapid click enrages
 * her, one click a minute doesn't. `habituation` means she slowly stops being
 * scared of a cursor that never actually hurts her.
 */
export interface Drives {
  fear: number
  annoy: number
  sleep: number
  curiosity: number
  habituation: number
}

function measureBounds(): { w: number; h: number } {
  return { w: Math.max(480, window.innerWidth), h: Math.max(360, window.innerHeight) }
}

export class World {
  cursor: Vec = v(-999, -999)
  cursorVel: Vec = v(0, 0)
  cursorSpeed = 0
  cursorStillMs = 0
  idleMs = 0

  dragging: { id: string; x: number; y: number } | null = null

  /** True while the pointer is physically holding her. */
  held = false
  grabOffset: Vec = v(0, 0)
  /** Set on release, cleared by the recovery behaviour. One shot. */
  pendingDrop = false
  /** Flee sets this when she's bolted and somewhere to hide exists. One shot. */
  pendingHide = false
  focusedApp: string | null = null
  appOpenedAt = 0

  critter: Critter = {
    pos: v(300, 400),
    vel: v(0, 0),
    facing: 1,
    anim: 'idle',
    say: null,
    anchored: false,
  }

  drives: Drives = { fear: 0, annoy: 0, sleep: 0, curiosity: 0, habituation: 0 }

  /**
   * Guarded: a page loaded in a background/hidden tab reports a 0x0 viewport,
   * which would clamp her to negative coordinates and strand her off screen.
   */
  bounds = measureBounds()

  /** Half her drawn canvas in screen px, so behaviours can place her edges. */
  spriteHalf = 48
  /** The drawn canvas is centred this far below her logical position. */
  spriteCenterDy = -12

  constructor() {
    bus.on('cursor.move', (p) => {
      this.cursorVel = v(p.vx, p.vy)
      this.cursorSpeed = Math.hypot(p.vx, p.vy)
      this.cursor = v(p.x, p.y)
      if (this.cursorSpeed > 40) {
        this.cursorStillMs = 0
        this.idleMs = 0
      }
    })
    bus.on('user.active', () => (this.idleMs = 0))
    bus.on('self.grabbed', (p) => {
      this.held = true
      this.grabOffset = v(p.offsetX, p.offsetY)
      this.drives.fear = 0
      this.idleMs = 0
    })
    bus.on('self.dropped', (p) => {
      this.held = false
      this.pendingDrop = true
      // She keeps the momentum of the throw.
      this.critter.vel = v(clamp(p.vx, -1600, 1600), clamp(p.vy, -1600, 1600))
      this.drives.fear = 0
      this.idleMs = 0
    })
    bus.on('self.clicked', () => {
      this.drives.annoy = clamp(this.drives.annoy + 0.34, 0, 1.4)
      this.idleMs = 0
    })
    bus.on('file.dragstart', (p) => (this.dragging = { id: p.id, x: p.x, y: p.y }))
    bus.on('file.drag', (p) => (this.dragging = { id: p.id, x: p.x, y: p.y }))
    bus.on('file.drop', () => (this.dragging = null))
    bus.on('app.open', (p) => {
      this.focusedApp = p.app
      this.appOpenedAt = performance.now()
      this.idleMs = 0
    })
    bus.on('window.focus', (p) => (this.focusedApp = p.app))
    window.addEventListener('resize', () => (this.bounds = measureBounds()))
  }

  /** Distance from the critter to the cursor. */
  get cursorDist(): number {
    return dist(this.critter.pos, this.cursor)
  }

  /** > 0 when the cursor is actively closing in on her. */
  get closingSpeed(): number {
    const dx = this.critter.pos.x - this.cursor.x
    const dy = this.critter.pos.y - this.cursor.y
    const d = Math.hypot(dx, dy) || 1
    return (this.cursorVel.x * dx + this.cursorVel.y * dy) / d
  }

  update(dt: number): void {
    this.cursorStillMs += dt * 1000
    this.idleMs += dt * 1000

    if (this.held) {
      this.drives.fear = 0
      this.drives.curiosity = 0
    }

    const d = this.cursorDist
    const near = this.held ? 0 : clamp(1 - d / 260, 0, 1)
    const charging = clamp(this.closingSpeed / 900, 0, 1)

    // Fear spikes fast, fades slow, and dulls with repeated harmless approaches.
    const scary = near * (0.35 + 0.9 * charging) * (1 - this.drives.habituation * 0.55)
    this.drives.fear =
      scary > this.drives.fear
        ? this.drives.fear + (scary - this.drives.fear) * clamp(dt * 9, 0, 1)
        : Math.max(0, this.drives.fear - dt * 0.55)

    if (d > 320) this.drives.habituation = Math.max(0, this.drives.habituation - dt * 0.02)

    this.drives.annoy = Math.max(0, this.drives.annoy - dt * 0.07)

    // Curiosity builds only when the cursor has been still and she isn't scared.
    if (this.cursorSpeed < 30 && d > 140 && this.drives.fear < 0.2) {
      this.drives.curiosity = clamp(this.drives.curiosity + dt * 0.13, 0, 1)
    } else {
      this.drives.curiosity = Math.max(0, this.drives.curiosity - dt * 0.5)
    }

    this.drives.sleep =
      this.idleMs > 30_000
        ? clamp(this.drives.sleep + dt * 0.4, 0, 1)
        : Math.max(0, this.drives.sleep - dt * 1.5)
  }
}
