/**
 * Rendering the critter.
 *
 * Two implementations behind one interface:
 *   PlaceholderSprite -- procedural SVG, so the toy is alive before any art exists.
 *   AtlasSprite       -- put `mouse.png` + `mouse.json` in src/art/ and it takes
 *                        over automatically. That's the swap-in point for the
 *                        real hand-drawn frames.
 *
 * The art is bundled at build time rather than fetched at runtime, because the
 * overlay loads over file:// where fetch() is blocked outright.
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
  /** Filename of the sheet, which must sit next to the JSON in src/art/. */
  image: string
  /** Size of one cell in the sheet, in pixels. */
  frameW: number
  frameH: number
  /** Display scale. Draw at 2x and set 0.5 for a crisp sprite on retina. */
  scale?: number
  fps: number
  /** Animation name -> row in the sheet + number of frames. */
  anims: Record<string, { row: number; count: number; fps?: number; loop?: boolean }>
  /** Optional per-frame attach points, e.g. where a carried file sits. */
  anchors?: Record<string, Record<string, [number, number][]>>
}

// Both globs are empty until you add art, which is a no-op rather than an error.
const ATLASES = import.meta.glob<{ default: AtlasDef }>('../art/*.json', { eager: true })
const SHEETS = import.meta.glob<string>('../art/*.{png,webp,gif,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function createSprite(): Sprite {
  const atlasPath = Object.keys(ATLASES)[0]
  if (!atlasPath) return new PlaceholderSprite()

  const def = ATLASES[atlasPath].default
  const wanted = def.image.split('/').pop() ?? def.image
  const url = Object.entries(SHEETS).find(([p]) => p.endsWith(`/${wanted}`))?.[1]

  if (!url) {
    console.error(
      `[mouseos] ${atlasPath} wants "${def.image}", but src/art/ has ` +
        `${Object.keys(SHEETS).length ? Object.keys(SHEETS).join(', ') : 'no image files'}. ` +
        'Falling back to the placeholder.',
    )
    return new PlaceholderSprite()
  }

  console.info(`[mouseos] drawing from ${atlasPath}`)
  return new AtlasSprite(def, url)
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
  private scale: number
  private warned = new Set<string>()

  constructor(
    private def: AtlasDef,
    url: string,
  ) {
    this.scale = def.scale ?? 1
    this.el = document.createElement('div')
    this.el.className = 'mo mo--atlas'
    this.el.innerHTML = `<div class="mo__bubble"></div><div class="mo__sheet"></div>`
    this.sheet = this.el.querySelector('.mo__sheet') as HTMLElement
    this.bubble = this.el.querySelector('.mo__bubble') as HTMLElement

    // Centre the cell on her position so any frame size lines up with the
    // placeholder's footprint.
    Object.assign(this.sheet.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      marginLeft: `${-def.frameW / 2}px`,
      marginTop: `${-def.frameH / 2}px`,
      width: `${def.frameW}px`,
      height: `${def.frameH}px`,
      backgroundImage: `url(${url})`,
    })

    this.verify(url)
  }

  /** The silent killer is a sheet whose grid doesn't match the JSON. Say so. */
  private verify(url: string): void {
    const rows = Math.max(...Object.values(this.def.anims).map((a) => a.row)) + 1
    const cols = Math.max(...Object.values(this.def.anims).map((a) => a.count))
    const img = new Image()
    img.onload = () => {
      const needW = cols * this.def.frameW
      const needH = rows * this.def.frameH
      if (img.naturalWidth < needW || img.naturalHeight < needH) {
        console.error(
          `[mouseos] ${this.def.image} is ${img.naturalWidth}x${img.naturalHeight}, but the ` +
            `atlas describes ${cols} columns x ${rows} rows of ${this.def.frameW}x${this.def.frameH} ` +
            `(needs at least ${needW}x${needH}). Frames will be cut off.`,
        )
      }
    }
    img.src = url
  }

  update(s: SpriteState): void {
    const a = this.def.anims[s.anim] ?? this.def.anims['idle']
    if (!a) {
      if (!this.warned.has(s.anim)) {
        this.warned.add(s.anim)
        console.warn(`[mouseos] no frames for "${s.anim}" and no "idle" to fall back on`)
      }
      return
    }
    const fps = a.fps ?? this.def.fps
    const raw = Math.floor(s.t * fps)
    const frame = a.loop === false ? Math.min(raw, a.count - 1) : raw % a.count
    this.sheet.style.backgroundPosition = `${-frame * this.def.frameW}px ${-a.row * this.def.frameH}px`
    this.sheet.style.transform = `scale(${this.scale * s.facing}, ${this.scale})`
    if (this.bubble.textContent !== (s.say ?? '')) this.bubble.textContent = s.say ?? ''
    this.bubble.classList.toggle('is-on', !!s.say)
  }
}
