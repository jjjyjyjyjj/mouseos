#!/usr/bin/env node
/**
 * art-source/ (her Procreate exports, full size) -> src/art/ (what ships).
 *
 * Procreate exports at canvas resolution, which for a 2048px canvas is ~16MB of
 * texture memory per frame once decoded. An always-on overlay holding every
 * frame would sit on hundreds of megabytes, so frames get downscaled here.
 * Originals stay untouched in art-source/.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, rename, stat, open as openFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const run = promisify(execFile)
const SRC = 'art-source'
const OUT = 'src/art'
const MAX = Number(process.env.ART_MAX ?? 384)

if (!existsSync(SRC)) {
  console.log(`[art] no ${SRC}/ -- nothing to prepare`)
  process.exit(0)
}

const isFrame = (f) => /\.(png|webp|avif)$/i.test(f) && !f.startsWith('.')

/** Width/height straight out of the PNG header, no image library needed. */
async function pngSize(file) {
  let fh
  try {
    fh = await openFile(file, 'r')
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(24), 0, 24, 0)
    if (bytesRead < 24 || buffer.toString('latin1', 1, 4) !== 'PNG') return null
    return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) }
  } catch {
    return null
  } finally {
    await fh?.close()
  }
}

/**
 * src/art/ is generated, but it's also the obvious place to drop new exports.
 * Anything found there at original resolution is adopted into art-source/
 * instead of being silently shipped at 2048px -- so either folder works.
 */
async function adoptStrayOriginals() {
  if (!existsSync(OUT)) return 0
  let moved = 0

  for (const anim of (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const outDir = path.join(OUT, anim.name)
    const srcDir = path.join(SRC, anim.name)

    for (const file of (await readdir(outDir)).filter(isFrame)) {
      const here = path.join(outDir, file)
      const size = await pngSize(here)
      const oversized = size && Math.max(size.w, size.h) > MAX
      const unbacked = !existsSync(path.join(srcDir, file))
      if (!oversized && !unbacked) continue

      await mkdir(srcDir, { recursive: true })
      await rename(here, path.join(srcDir, file))
      moved++
    }
  }

  if (moved) console.log(`[art] adopted ${moved} original${moved === 1 ? '' : 's'} from ${OUT}/ into ${SRC}/`)
  return moved
}

await adoptStrayOriginals()

let made = 0
let skipped = 0

for (const anim of (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory())) {
  const inDir = path.join(SRC, anim.name)
  const outDir = path.join(OUT, anim.name)
  await mkdir(outDir, { recursive: true })

  for (const file of (await readdir(inDir)).filter(isFrame)) {
    const from = path.join(inDir, file)
    const to = path.join(outDir, file)

    // Skip anything already newer than its source.
    if (existsSync(to) && (await stat(to)).mtimeMs >= (await stat(from)).mtimeMs) {
      skipped++
      continue
    }
    // sips is built into macOS and keeps the alpha channel intact.
    await run('sips', ['-Z', String(MAX), from, '--out', to])
    made++
  }
}

console.log(`[art] ${made} frame${made === 1 ? '' : 's'} resized to ${MAX}px, ${skipped} already current`)
