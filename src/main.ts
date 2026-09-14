import './style.css'
import { bus } from './bus'
import { buildDesktop } from './os/desktop'
import { Mouse } from './mouse'

const root = document.getElementById('os') as HTMLElement
buildDesktop(root)

const mouse = new Mouse()
await mouse.mount(root)

/** Poke at her from the console: `mouseos.world.drives.fear = 1` */
;(window as unknown as { mouseos: Mouse }).mouseos = mouse

/* --- cursor perception ------------------------------------------------- */
let last = { x: 0, y: 0, t: performance.now() }
window.addEventListener('pointermove', (e) => {
  const now = performance.now()
  const dt = Math.max(16, now - last.t) / 1000
  bus.emit('cursor.move', {
    x: e.clientX,
    y: e.clientY,
    vx: (e.clientX - last.x) / dt,
    vy: (e.clientY - last.y) / dt,
  })
  last = { x: e.clientX, y: e.clientY, t: now }
})
for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) {
  window.addEventListener(ev, () => bus.emit('user.active', {}))
}

/* --- debug HUD (press D) ------------------------------------------------ */
const hud = document.createElement('pre')
hud.className = 'hud'
root.appendChild(hud)
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'd') hud.classList.toggle('is-on')
})

/* --- the loop ----------------------------------------------------------- */
let prev = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000)
  prev = now
  mouse.update(dt)
  if (hud.classList.contains('is-on')) hud.textContent = mouse.status
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
