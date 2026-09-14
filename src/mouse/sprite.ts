/**
 * Rendering the critter.
 *
 * Two implementations behind one interface:
 *   PlaceholderSprite -- procedural SVG, so the toy is alive before any art exists.
 *   AtlasSprite       -- drop `public/mouse.png` + `public/mouse.json` and it
 *                        takes over automatically. That's the swap-in point for
 *                        the real hand-drawn frames.
 *
 * Real art should be sprite sheets on twos (~10fps). Choppy reads as hand-drawn
 * and costs you a third of the frames.
 */

export interface SpriteState {
  anim: string
  facing: 1 | -1
  /** Seconds since this animation started. */
  t: number
  say: string | null
}

export interface Sprite {
  el: HTMLElement
  update(s: SpriteState): void
}

export interface AtlasDef {
  image: string
  frameW: number
  frameH: number
  fps: number
  /** Animation name -> row in the sheet + number of frames. */
  anims: Record<string, { row: number; count: number; fps?: number; loop?: boolean }>
  /** Optional per-frame attach points, e.g. where a carried file sits. */
  anchors?: Record<string, Record<string, [number, number][]>>
}

export async function createSprite(): Promise<Sprite> {
  try {
    const res = await fetch('/mouse.json')
    if (res.ok) return new AtlasSprite((await res.json()) as AtlasDef)
  } catch {
    /* no atlas yet -- that's the normal case */
  }
  return new PlaceholderSprite()
}

/* ------------------------------------------------------------------ */

const SVG = `
<svg viewBox="0 0 100 100" width="96" height="96" class="mo__svg">
  <g id="mo-root">
    <path id="mo-tail" d="M24 62 C 8 64, 6 44, 18 44" fill="none" stroke="#2a2320" stroke-width="3.5" stroke-linecap="round"/>
    <circle id="mo-earL" cx="60" cy="34" r="10" fill="#fff" stroke="#2a2320" stroke-width="3.5"/>
    <circle id="mo-earR" cx="75" cy="36" r="8.5" fill="#fff" stroke="#2a2320" stroke-width="3.5"/>
    <circle cx="60" cy="34" r="4.5" fill="#f3c9cd" stroke="none"/>
    <ellipse id="mo-footL" cx="38" cy="76" rx="7" ry="4" fill="#fff" stroke="#2a2320" stroke-width="3"/>
    <ellipse id="mo-footR" cx="56" cy="76" rx="7" ry="4" fill="#fff" stroke="#2a2320" stroke-width="3"/>
    <g id="mo-body">
      <ellipse cx="46" cy="58" rx="25" ry="19" fill="#fff" stroke="#2a2320" stroke-width="3.5"/>
      <circle cx="68" cy="50" r="15" fill="#fff" stroke="#2a2320" stroke-width="3.5"/>
      <path d="M53 46 C 60 42, 66 42, 72 45" fill="none" stroke="#fff" stroke-width="6"/>
      <ellipse id="mo-eye" cx="72" cy="48" rx="2.8" ry="3" fill="#2a2320"/>
      <path id="mo-lid" d="M68 48 L 77 48" stroke="#2a2320" stroke-width="3" stroke-linecap="round" opacity="0"/>
      <path id="mo-brow" d="M67 40 L 78 44" stroke="#2a2320" stroke-width="3" stroke-linecap="round" opacity="0"/>
      <g id="mo-glasses" opacity="0">
        <circle cx="71" cy="48" r="7.5" fill="none" stroke="#2a2320" stroke-width="2.6"/>
        <circle cx="84" cy="50" r="5" fill="none" stroke="#2a2320" stroke-width="2.6"/>
        <path d="M78.5 48.6 L 79.6 49.4" stroke="#2a2320" stroke-width="2.6"/>
        <path d="M64 46 L 58 44" stroke="#2a2320" stroke-width="2.6" stroke-linecap="round"/>
      </g>
      <circle id="mo-nose" cx="82" cy="53" r="3.2" fill="#e8899a" stroke="#2a2320" stroke-width="2.2"/>
      <path d="M80 57 L 88 61 M80 55 L 89 54" stroke="#2a2320" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
    </g>
  </g>
</svg>`

class PlaceholderSprite implements Sprite {
  el: HTMLElement
  private root: SVGGElement
  private body: SVGGElement
  private tail: SVGPathElement
  private earL: SVGCircleElement
  private earR: SVGCircleElement
  private footL: SVGEllipseElement
  private footR: SVGEllipseElement
  private eye: SVGEllipseElement
  private lid: SVGPathElement
  private brow: SVGPathElement
  private glasses: SVGGElement
  private bubble: HTMLElement

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'mo'
    this.el.innerHTML = `<div class="mo__bubble"></div>${SVG}`
    const q = <T extends Element>(id: string) => this.el.querySelector(id) as unknown as T
    this.root = q<SVGGElement>('#mo-root')
    this.body = q<SVGGElement>('#mo-body')
    this.tail = q<SVGPathElement>('#mo-tail')
    this.earL = q<SVGCircleElement>('#mo-earL')
    this.earR = q<SVGCircleElement>('#mo-earR')
    this.footL = q<SVGEllipseElement>('#mo-footL')
    this.footR = q<SVGEllipseElement>('#mo-footR')
    this.eye = q<SVGEllipseElement>('#mo-eye')
    this.lid = q<SVGPathElement>('#mo-lid')
    this.brow = q<SVGPathElement>('#mo-brow')
    this.glasses = q<SVGGElement>('#mo-glasses')
    this.bubble = this.el.querySelector('.mo__bubble') as HTMLElement
  }

  update(s: SpriteState): void {
    const t = s.t
    let bob = 0
    let tilt = 0
    let step = 0
    let ear = 0
    let squash = 1
    let eye = 1
    let jitter = 0
    let tailWag = Math.sin(t * 3) * 4

    switch (s.anim) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 11)) * 3
        step = Math.sin(t * 11) * 6
        tailWag = Math.sin(t * 11) * 10
        break
      case 'run':
      case 'stomp':
        bob = Math.abs(Math.sin(t * 20)) * 5
        step = Math.sin(t * 20) * 9
        tilt = s.anim === 'run' ? 8 : 0
        tailWag = Math.sin(t * 20) * 16
        ear = s.anim === 'run' ? 22 : -10
        eye = 1.5
        break
      case 'sniff':
        bob = Math.sin(t * 14) * 1.4
        tilt = Math.sin(t * 7) * 3
        break
      case 'perk':
        ear = -14
        bob = Math.sin(t * 4) * 1
        eye = 1.3
        break
      case 'cower':
        squash = 0.74
        ear = 30
        jitter = Math.sin(t * 34) * 1.2
        eye = 1.4
        break
      case 'peek':
        squash = 0.85
        ear = 10
        tilt = -6
        break
      case 'angry':
        jitter = Math.sin(t * 42) * 2.4
        ear = -20
        squash = 0.92
        eye = 0.7
        break
      case 'dance':
        bob = Math.abs(Math.sin(t * 8)) * 7
        tilt = Math.sin(t * 4) * 15
        step = Math.sin(t * 8) * 8
        ear = Math.sin(t * 8) * 14
        tailWag = Math.sin(t * 8) * 22
        break
      case 'read':
        bob = Math.sin(t * 2) * 1.2
        tilt = Math.sin(t * 1.3) * 2.5
        ear = -6
        break
      case 'yawn':
        squash = 0.95
        eye = 0.2
        break
      case 'curl':
        squash = 0.6
        ear = 26
        eye = 0
        break
      default: // idle
        bob = Math.sin(t * 3) * 1.6
        break
    }

    this.root.setAttribute(
      'transform',
      `translate(${jitter.toFixed(2)} ${(-bob).toFixed(2)}) rotate(${tilt} 50 60) scale(${s.facing} 1) ${
        s.facing === -1 ? 'translate(-100 0)' : ''
      }`,
    )
    this.body.setAttribute('transform', `translate(0 ${((1 - squash) * 26).toFixed(2)}) scale(1 ${squash})`)
    this.tail.setAttribute('transform', `rotate(${tailWag.toFixed(2)} 24 62)`)
    this.earL.setAttribute('transform', `rotate(${ear} 60 44)`)
    this.earR.setAttribute('transform', `rotate(${ear} 75 44)`)
    this.footL.setAttribute('transform', `translate(${step.toFixed(2)} 0)`)
    this.footR.setAttribute('transform', `translate(${(-step).toFixed(2)} 0)`)
    this.eye.setAttribute('ry', String(3 * eye))
    this.lid.setAttribute('opacity', eye < 0.15 ? '1' : '0')
    this.eye.setAttribute('opacity', eye < 0.15 ? '0' : '1')
    this.brow.setAttribute('opacity', s.anim === 'angry' || s.anim === 'stomp' ? '1' : '0')
    this.glasses.setAttribute('opacity', s.anim === 'read' ? '1' : '0')

    if (this.bubble.textContent !== (s.say ?? '')) this.bubble.textContent = s.say ?? ''
    this.bubble.classList.toggle('is-on', !!s.say)
  }
}

/* ------------------------------------------------------------------ */

class AtlasSprite implements Sprite {
  el: HTMLElement
  private sheet: HTMLElement
  private bubble: HTMLElement

  constructor(private def: AtlasDef) {
    this.el = document.createElement('div')
    this.el.className = 'mo mo--atlas'
    this.el.innerHTML = `<div class="mo__bubble"></div><div class="mo__sheet"></div>`
    this.sheet = this.el.querySelector('.mo__sheet') as HTMLElement
    this.bubble = this.el.querySelector('.mo__bubble') as HTMLElement
    Object.assign(this.sheet.style, {
      width: `${def.frameW}px`,
      height: `${def.frameH}px`,
      backgroundImage: `url(${def.image})`,
      imageRendering: 'auto',
    })
  }

  update(s: SpriteState): void {
    const a = this.def.anims[s.anim] ?? this.def.anims['idle']
    if (!a) return
    const fps = a.fps ?? this.def.fps
    const raw = Math.floor(s.t * fps)
    const frame = a.loop === false ? Math.min(raw, a.count - 1) : raw % a.count
    this.sheet.style.backgroundPosition = `${-frame * this.def.frameW}px ${-a.row * this.def.frameH}px`
    this.sheet.style.transform = `scaleX(${s.facing})`
    if (this.bubble.textContent !== (s.say ?? '')) this.bubble.textContent = s.say ?? ''
    this.bubble.classList.toggle('is-on', !!s.say)
  }
}
