import { bus } from '../bus'
import { zorder } from './zorder'

/**
 * The fake OS. It knows nothing about the mouse -- it only emits events.
 *
 * Drag is hand-rolled on pointer events, NOT the HTML5 drag-and-drop API:
 * we need full control of the ghost image so the icon can later be handed
 * off from the cursor to the mouse's paws.
 */

export interface FileIcon {
  id: string
  label: string
  glyph: string
  x: number
  y: number
  el: HTMLElement
  /** Folders and Trash accept drops. */
  accepts: boolean
}

const icons = new Map<string, FileIcon>()
let root: HTMLElement

export function getIcon(id: string): FileIcon | undefined {
  return icons.get(id)
}
export function allIcons(): FileIcon[] {
  return [...icons.values()]
}

export function buildDesktop(mount: HTMLElement): void {
  root = mount
  root.className = 'os'
  root.innerHTML = `
    <div class="menubar">
      <span class="apple">&#9679;</span>
      <span class="menu-title">MouseOS</span>
      <span class="menu menu--tag">dev sandbox</span>
      <span class="menu">File</span><span class="menu">Edit</span><span class="menu">View</span>
      <span class="clock"></span>
    </div>
    <div class="desktop" id="desktop"></div>
    <div class="dock" id="dock"></div>
  `
  const clock = root.querySelector('.clock') as HTMLElement
  const tick = () =>
    (clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  tick()
  setInterval(tick, 10_000)

  const desktop = root.querySelector('#desktop') as HTMLElement

  addIcon(desktop, { id: 'notes', label: 'notes.txt', glyph: '\u{1F4C4}', x: 60, y: 60, accepts: false })
  addIcon(desktop, { id: 'photo', label: 'cheese.png', glyph: '\u{1F9C0}', x: 60, y: 170, accepts: false })
  addIcon(desktop, { id: 'docs', label: 'Documents', glyph: '\u{1F4C1}', x: 60, y: 280, accepts: true })
  addIcon(desktop, { id: 'trash', label: 'Trash', glyph: '\u{1F5D1}', x: 60, y: 390, accepts: true })

  makeWindow(desktop, 'win-readme', 'notes', 'README.txt', 420, 120, 380, 240,
    `MouseOS v0.0.1\n\nShe lives here now.\n\n· move the cursor at her and she bolts\n· leave her alone and she gets curious\n· click her repeatedly at your own risk\n· do nothing for 30s and she naps\n\nDrag the window around -- she can hide\nbehind it.`)

  buildDock(root.querySelector('#dock') as HTMLElement)
}

function addIcon(
  parent: HTMLElement,
  spec: Omit<FileIcon, 'el'>,
): void {
  const el = document.createElement('div')
  el.className = 'icon' + (spec.accepts ? ' icon--target' : '')
  el.dataset.id = spec.id
  el.style.transform = `translate3d(${spec.x}px, ${spec.y}px, 0)`
  el.innerHTML = `<div class="icon__glyph">${spec.glyph}</div><div class="icon__label">${spec.label}</div>`
  parent.appendChild(el)

  const icon: FileIcon = { ...spec, el }
  icons.set(spec.id, icon)
  if (!spec.accepts) makeDraggable(icon)
}

function makeDraggable(icon: FileIcon): void {
  icon.el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    icon.el.setPointerCapture(e.pointerId)
    icon.el.classList.add('is-dragging')

    const dx = e.clientX - icon.x
    const dy = e.clientY - icon.y
    bus.emit('file.dragstart', { id: icon.id, x: icon.x, y: icon.y })

    const onMove = (ev: PointerEvent) => {
      moveIcon(icon, ev.clientX - dx, ev.clientY - dy)
      bus.emit('file.drag', { id: icon.id, x: icon.x, y: icon.y })
    }

    const onUp = (ev: PointerEvent) => {
      icon.el.releasePointerCapture(ev.pointerId)
      icon.el.classList.remove('is-dragging')
      icon.el.removeEventListener('pointermove', onMove)
      icon.el.removeEventListener('pointerup', onUp)
      const target = dropTargetAt(ev.clientX, ev.clientY, icon.id)
      bus.emit('file.drop', { id: icon.id, x: icon.x, y: icon.y, target })
      // NOTE: we do NOT commit here. In step 3 the mouse walks the file over
      // and calls commitDrop() when she actually arrives. For now, commit
      // immediately so the OS is usable on its own.
      if (target) commitDrop(icon.id, target)
    }

    icon.el.addEventListener('pointermove', onMove)
    icon.el.addEventListener('pointerup', onUp)
  })
}

export function moveIcon(icon: FileIcon, x: number, y: number): void {
  icon.x = x
  icon.y = y
  icon.el.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

function dropTargetAt(x: number, y: number, exceptId: string): string | null {
  for (const icon of icons.values()) {
    if (!icon.accepts || icon.id === exceptId) continue
    const r = icon.el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return icon.id
  }
  return null
}

/** The file actually goes in. Separated so the mouse can be the one to do it. */
export function commitDrop(fileId: string, targetId: string): void {
  const icon = icons.get(fileId)
  const target = icons.get(targetId)
  if (!icon || !target) return
  icon.el.classList.add('is-consumed')
  target.el.classList.add('is-bumped')
  setTimeout(() => target.el.classList.remove('is-bumped'), 320)
  setTimeout(() => {
    // Put it back for now so you can keep playing with the toy.
    icon.el.classList.remove('is-consumed')
    moveIcon(icon, 60, fileId === 'notes' ? 60 : 170)
  }, 700)
}

const windowIds: string[] = []
function makeWindow(
  parent: HTMLElement,
  id: string,
  app: string,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number,
  body: string,
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'window'
  el.dataset.id = id
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  el.innerHTML = `
    <div class="window__bar">
      <span class="dot dot--r"></span><span class="dot dot--y"></span><span class="dot dot--g"></span>
      <span class="window__title">${title}</span>
    </div>
    <pre class="window__body">${body}</pre>
  `
  parent.appendChild(el)
  zorder.register(id, el)
  windowIds.push(id)

  let wx = x
  let wy = y
  const bar = el.querySelector('.window__bar') as HTMLElement

  el.addEventListener('pointerdown', () => {
    zorder.raise(id)
    bus.emit('window.focus', { id, app })
  })

  bar.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    bar.setPointerCapture(e.pointerId)
    const dx = e.clientX - wx
    const dy = e.clientY - wy
    const onMove = (ev: PointerEvent) => {
      wx = ev.clientX - dx
      wy = ev.clientY - dy
      el.style.transform = `translate3d(${wx}px, ${wy}px, 0)`
      bus.emit('window.move', { id })
    }
    const onUp = (ev: PointerEvent) => {
      bar.releasePointerCapture(ev.pointerId)
      bar.removeEventListener('pointermove', onMove)
      bar.removeEventListener('pointerup', onUp)
    }
    bar.addEventListener('pointermove', onMove)
    bar.addEventListener('pointerup', onUp)
  })

  return el
}

/**
 * The dock exists mostly to prove the point: opening an app is just an event.
 * Step 5 is a table mapping app name -> behavior. No OS code changes.
 */
function buildDock(dock: HTMLElement): void {
  const apps: [string, string][] = [
    ['finder', '\u{1F5C2}'],
    ['spotify', '\u{1F3B5}'],
    ['vscode', '\u{1F4BB}'],
    ['mail', '✉'],
  ]
  for (const [app, glyph] of apps) {
    const b = document.createElement('button')
    b.className = 'dock__app'
    b.title = app
    b.textContent = glyph
    b.addEventListener('click', () => {
      b.classList.add('is-bounced')
      setTimeout(() => b.classList.remove('is-bounced'), 600)
      bus.emit('app.open', { app })
    })
    dock.appendChild(b)
  }
}

export function desktopBounds(): DOMRect {
  return (root.querySelector('#desktop') as HTMLElement).getBoundingClientRect()
}

export function allWindowIds(): readonly string[] {
  return windowIds
}
