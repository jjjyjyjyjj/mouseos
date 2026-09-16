import { bus } from '../bus'
import { MOUSE_LAYER, zorder } from '../os/zorder'
import { behaviors } from './behaviors'
import { Brain } from './brain'
import { createSprite, type Sprite } from './sprite'
import { integrate } from './steps'
import { World } from './world'

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

    this.sprite.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      bus.emit('self.clicked', { x: e.clientX, y: e.clientY })
    })
  }

  /** Brain ticks at its own cadence inside Brain; motion runs every frame. */
  update(dt: number): void {
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

    this.sprite.el.style.transform = `translate3d(${(c.pos.x - 48).toFixed(1)}px, ${(c.pos.y - 60).toFixed(1)}px, 0)`
    this.sprite.el.classList.toggle('is-hidden-behind', !!c.hidingBehind)
    this.sprite.update({ anim: c.anim, facing: c.facing, t: this.animT, say: c.say })
  }

  /** For the debug HUD. */
  get status(): string {
    const d = this.world.drives
    const f = (n: number) => n.toFixed(2)
    const c = this.world.critter
    return `${this.brain.current?.id ?? '-'} / ${c.anim}   app:${this.world.focusedApp ?? '?'}
at ${Math.round(c.pos.x)},${Math.round(c.pos.y)}
fear ${f(d.fear)}  annoy ${f(d.annoy)}
sleep ${f(d.sleep)}  curious ${f(d.curiosity)}
habituation ${f(d.habituation)}`
  }
}
