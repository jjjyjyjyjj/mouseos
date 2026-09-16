/**
 * The one seam in the whole project.
 *
 * The desktop (windows, icons, apps) NEVER talks to the mouse directly. It only
 * announces semantic facts about the world. The mouse listens and decides what,
 * if anything, it cares about. Adding a new reaction should mean adding a
 * behavior -- never touching OS code.
 */

export type OSEvents = {
  'cursor.move': { x: number; y: number; vx: number; vy: number }
  'user.active': Record<string, never>
  'file.dragstart': { id: string; x: number; y: number }
  'file.drag': { id: string; x: number; y: number }
  'file.drop': { id: string; x: number; y: number; target: string | null }
  'window.focus': { id: string; app: string }
  'window.move': { id: string }
  'app.open': { app: string }
  'self.clicked': { x: number; y: number }
  /** The pointer has picked her up. Offsets keep her from snapping to centre. */
  'self.grabbed': { offsetX: number; offsetY: number }
  /** Let go. Whatever the pointer was doing becomes her launch velocity. */
  'self.dropped': { vx: number; vy: number }
}

type Handler<K extends keyof OSEvents> = (payload: OSEvents[K]) => void

class Bus {
  private handlers = new Map<string, Set<Handler<never>>>()

  on<K extends keyof OSEvents>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(fn as Handler<never>)
    return () => set!.delete(fn as Handler<never>)
  }

  emit<K extends keyof OSEvents>(type: K, payload: OSEvents[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const fn of set) (fn as Handler<K>)(payload)
  }
}

export const bus = new Bus()
