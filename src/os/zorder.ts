/**
 * A single stacking order for everything that can overlap -- windows AND the
 * mouse. This is why the mouse is a DOM element and not a canvas overlay: a
 * canvas can only ever be on top, but she needs to be able to scurry BEHIND a
 * window and hide there.
 */

const BASE_Z = 100

export class ZOrder {
  private order: string[] = []
  private els = new Map<string, HTMLElement>()

  register(id: string, el: HTMLElement): void {
    this.els.set(id, el)
    this.order.push(id)
    this.apply()
  }

  /** Bring to the very front. */
  raise(id: string): void {
    this.move(id, this.order.length)
  }

  /** Slot directly underneath another layer. Returns false if unknown. */
  putBelow(id: string, otherId: string): boolean {
    const target = this.order.indexOf(otherId)
    if (target < 0) return false
    this.move(id, target)
    return true
  }

  private move(id: string, to: number): void {
    const from = this.order.indexOf(id)
    if (from < 0) return
    this.order.splice(from, 1)
    this.order.splice(from < to ? to - 1 : to, 0, id)
    this.apply()
  }

  /** Topmost registered layer whose box contains the point (ignoring `except`). */
  topmostAt(x: number, y: number, except?: string): string | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i]
      if (id === except) continue
      const el = this.els.get(id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  /** Front-to-back, the same order the real window list arrives in. */
  frontToBack(): string[] {
    return [...this.order].reverse()
  }

  rectOf(id: string): DOMRect | null {
    return this.els.get(id)?.getBoundingClientRect() ?? null
  }

  private apply(): void {
    this.order.forEach((id, i) => {
      const el = this.els.get(id)
      if (el) el.style.zIndex = String(BASE_Z + i)
    })
  }
}

export const zorder = new ZOrder()

/** The mouse occupies a normal layer, which is how she can hide behind a window. */
export const MOUSE_LAYER = 'mouse'
