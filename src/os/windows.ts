import { allWindowIds } from './desktop'
import { zorder } from './zorder'

/**
 * Where the windows are.
 *
 * In the sandbox that's the fake desktop's own stacking order. In the overlay
 * it's everyone else's real windows, read from CGWindowList by a helper and
 * pushed in over IPC. Behaviours ask here and never learn which.
 */
export interface WinRect {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface NativeWindow {
  id: string
  owner: string
  left: number
  top: number
  width: number
  height: number
}

let native: WinRect[] | null = null

export function setNativeWindows(list: NativeWindow[]): void {
  native = list.map((w) => ({
    id: w.id,
    left: w.left,
    top: w.top,
    width: w.width,
    height: w.height,
    right: w.left + w.width,
    bottom: w.top + w.height,
  }))
}

/** True once the overlay has told us about real windows. */
export function usingNativeWindows(): boolean {
  return native !== null
}

/** Front-to-back. */
export function windowRects(): WinRect[] {
  if (native) return native

  const out: WinRect[] = []
  for (const id of allWindowIds()) {
    const r = zorder.rectOf(id)
    if (!r) continue
    out.push({
      id,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    })
  }
  return out
}
