import './style.css'
import { bus } from './bus'
import { buildDesktop } from './os/desktop'
import { bootNative, nativeBridge, syncClickable } from './os/native'
import { Mouse } from './mouse'

const root = document.getElementById('os') as HTMLElement
const native = nativeBridge()
const mouse = new Mouse()

// The virtual desktop is a development sandbox for building behaviours, and
// must never appear on someone's actual screen. If the app is running as the
// overlay but the bridge is missing, that's a failure to report -- not a cue
// to paint a fake computer over the real one.
const inApp = navigator.userAgent.includes('Electron')
if (inApp && !native) {
  root.className = 'os os--native'
  root.innerHTML =
    '<pre class="fatal">MouseOS could not reach the system bridge.\n' +
    'electron/preload.cjs failed to load, so she has no senses.</pre>'
  throw new Error('[mouseos] native bridge missing')
}

if (native) {
  // Overlay mode: no fake desktop, because she's standing on your real one.
  document.documentElement.classList.add('native')
  document.body.classList.add('native')
  root.className = 'os os--native'
  mouse.mount(root)
  bootNative(native, mouse.world)
} else {
  buildDesktop(root)
  mouse.mount(root)
  bootWeb()
}

/** Poke at her from the console: `mouseos.world.drives.fear = 1` */
;(window as unknown as { mouseos: Mouse }).mouseos = mouse

/* --- perception, browser flavour ---------------------------------------- */
function bootWeb(): void {
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
let running = false

function frame(now: number) {
  if (!running) return
  const dt = Math.min(0.05, (now - prev) / 1000)
  prev = now
  mouse.update(dt)
  if (native) syncClickable(native, mouse.world)
  if (hud.classList.contains('is-on')) hud.textContent = mouse.status
  requestAnimationFrame(frame)
}

function setRunning(on: boolean): void {
  if (on === running) return
  running = on
  if (!on) return
  prev = performance.now() // don't hand her one enormous frame on resume
  requestAnimationFrame(frame)
}

// Switched off means switched off: no loop at all, not a hidden window still
// simulating a mouse nobody can see.
native?.onEnabled?.((on) => setRunning(on))
setRunning(true)
