export interface Vec { x: number; y: number }

export const v = (x: number, y: number): Vec => ({ x, y })
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

/** Move `toward` a point, easing down inside `slowRadius` so she doesn't skid. */
export function arrive(pos: Vec, target: Vec, maxSpeed: number, slowRadius = 40): Vec {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const d = Math.hypot(dx, dy) || 1
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed
  return v((dx / d) * speed, (dy / d) * speed)
}

export function flee(pos: Vec, from: Vec, maxSpeed: number): Vec {
  const dx = pos.x - from.x
  const dy = pos.y - from.y
  const d = Math.hypot(dx, dy) || 1
  return v((dx / d) * maxSpeed, (dy / d) * maxSpeed)
}

/** Steer velocity toward a desired velocity. Low accel = heavier, floatier. */
export function steer(vel: Vec, desired: Vec, accel: number, dt: number): void {
  vel.x = lerp(vel.x, desired.x, clamp(accel * dt, 0, 1))
  vel.y = lerp(vel.y, desired.y, clamp(accel * dt, 0, 1))
}
