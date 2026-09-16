import { bus } from '../bus'
import { dist } from '../mouse/motion'
import type { World } from '../mouse/world'

/**
 * Perception adapter for the real desktop.
 *
 * This is the payoff of the bus: the brain never learns whether "the cursor
 * moved" came from a DOM event or from macOS. Same events, different source.
 */
export interface NativeBridge {
  onCursor(cb: (p: { x: number; y: number }) => void): void
  onIdle(cb: (seconds: number) => void): void
  onApp(cb: (name: string) => void): void
  setClickable(yes: boolean): void
}

export function nativeBridge(): NativeBridge | null {
  return (window as unknown as { mouseNative?: NativeBridge }).mouseNative ?? null
}

/** macOS process names -> the keys behaviors match on. */
function normalizeApp(name: string): string {
  const n = name.toLowerCase()
  if (n === 'code' || n.includes('visual studio code')) return 'vscode'
  if (n.includes('spotify') || n.includes('music')) return 'spotify'
  if (n.includes('terminal') || n === 'iterm2' || n.includes('ghostty')) return 'terminal'
  if (n.includes('chrome') || n.includes('safari') || n.includes('arc') || n.includes('firefox')) return 'browser'
  if (n === 'finder') return 'finder'
  return n
}

export function bootNative(bridge: NativeBridge, world: World): void {
  let last = { x: 0, y: 0, t: performance.now() }

  bridge.onCursor((p) => {
    const now = performance.now()
    const dt = Math.max(8, now - last.t) / 1000
    bus.emit('cursor.move', { x: p.x, y: p.y, vx: (p.x - last.x) / dt, vy: (p.y - last.y) / dt })
    last = { x: p.x, y: p.y, t: now }
  })

  // The real thing: macOS tells us how long you've actually been away, so the
  // nap triggers on genuine idleness rather than "no events hit this window".
  bridge.onIdle((seconds) => {
    world.idleMs = seconds * 1000
    if (seconds < 1) bus.emit('user.active', {})
  })

  bridge.onApp((name) => bus.emit('app.open', { app: normalizeApp(name) }))
}

/**
 * The overlay ignores mouse events so you can use your computer through it.
 * We punch a temporary hole when the pointer is on top of her, which is the
 * only way clicking her is possible at all.
 */
const HOLE_RADIUS = 44
let clickable = false

export function syncClickable(bridge: NativeBridge, world: World): void {
  // Sticky edge: the hole is slightly larger once open, so it doesn't chatter.
  const r = clickable ? HOLE_RADIUS + 14 : HOLE_RADIUS
  // While she's being dragged the overlay must keep receiving the pointer, or
  // the drag dies the instant the cursor outruns her.
  const want = world.held || dist(world.cursor, world.critter.pos) < r
  if (want === clickable) return
  clickable = want
  bridge.setClickable(want)
}
