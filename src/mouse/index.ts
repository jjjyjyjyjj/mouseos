import { bus } from '../bus'
import { usingNativeWindows, windowRects } from '../os/windows'
import { MOUSE_LAYER, zorder } from '../os/zorder'
import { behaviors } from './behaviors'
import { Brain } from './brain'
import { createSprite, type Sprite } from './sprite'
import { integrate } from './steps'
import { World } from './world'

/** Her container box, and how far its centre sits above her logical position. */
const BOX = 96
const CENTER_DY = -12

export class Mouse {
  readonly world = new World()
  private brain = new Brain(behaviors)
  private sprite!: Sprite
  private animName = ''
  private animT = 0

  mount(parent: HTMLElement): void {
    this.sprite = createSprite()
    parent.appendChild(this.sprite.el)
    zorder.register(MOUSE_LAYER, this.sprite.el)

    this.bindPointer(this.sprite.el)
  }

  /**
   * One gesture, two meanings. A press that barely moves is a poke; a press
   * that travels picks her up. Releasing a drag throws her with whatever
   * velocity the pointer had.
   */
  private bindPointer(el: HTMLElement): void {
    const SLOP = 6
    const MAX_THROW = 1600

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      // Capture keeps the drag alive when the pointer outruns her; failing to
      // get it is not a reason to abandon the gesture.
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* no active pointer (synthetic events) */
      }
      el.classList.add('is-grabbing')

      const start = { x: e.clientX, y: e.clientY }
      let dragging = false
      let last = { x: e.clientX, y: e.clientY, t: performance.now() }
      let vx = 0
      let vy = 0

      const onMove = (ev: PointerEvent) => {
        const now = performance.now()
        const dt = Math.max(8, now - last.t) / 1000
        vx = (ev.clientX - last.x) / dt
        vy = (ev.clientY - last.y) / dt
        last = { x: ev.clientX, y: ev.clientY, t: now }

        if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > SLOP) {
          dragging = true
          const c = this.world.critter
          bus.emit('self.grabbed', {
            offsetX: c.pos.x - ev.clientX,
            offsetY: c.pos.y - ev.clientY,
          })
        }
      }

      const onUp = (ev: PointerEvent) => {
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* never captured */
        }
        el.classList.remove('is-grabbing')
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)

        if (!dragging) {
          bus.emit('self.clicked', { x: ev.clientX, y: ev.clientY })
          return
        }
        // A pointer that stopped before release shouldn't fling her.
        const stale = performance.now() - last.t > 120
        bus.emit('self.dropped', {
          vx: stale ? 0 : Math.max(-MAX_THROW, Math.min(MAX_THROW, vx)),
          vy: stale ? 0 : Math.max(-MAX_THROW, Math.min(MAX_THROW, vy)),
        })
      }

      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
    })
  }

  /** Brain ticks at its own cadence inside Brain; motion runs every frame. */
  update(dt: number): void {
    if (this.sprite.displayHalf) this.world.spriteHalf = this.sprite.displayHalf()
    this.world.spriteCenterDy = CENTER_DY
    this.world.update(dt)
    this.brain.update(this.world, dt)
    integrate(this.world, dt)

    const c = this.world.critter
    if (c.anim !== this.animName) {
      this.animName = c.anim
      this.animT = 0
    } else {
      this.animT += dt
    }

    this.sprite.el.style.transform =
      `translate3d(${(c.pos.x - BOX / 2).toFixed(1)}px, ${(c.pos.y + CENTER_DY - BOX / 2).toFixed(1)}px, 0)`
    this.sprite.el.classList.toggle('is-hidden-behind', !!c.hidingBehind)
    this.sprite.update({ anim: c.anim, facing: c.facing, t: this.animT, say: c.say })
  }

  /** For the debug HUD. */
  get status(): string {
    const d = this.world.drives
    const f = (n: number) => n.toFixed(2)
    const c = this.world.critter
    return `${this.brain.current?.id ?? '-'} / ${c.anim}   app:${this.world.focusedApp ?? '?'}
at ${Math.round(c.pos.x)},${Math.round(c.pos.y)}  windows:${windowRects().length}${usingNativeWindows() ? ' (real)' : ''}
fear ${f(d.fear)}  annoy ${f(d.annoy)}
sleep ${f(d.sleep)}  curious ${f(d.curiosity)}
habituation ${f(d.habituation)}`
  }
}
