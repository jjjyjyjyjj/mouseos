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
import { mkdir, readdir, stat } from 'node:fs/promises'
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
