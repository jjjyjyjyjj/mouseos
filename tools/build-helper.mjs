#!/usr/bin/env node
/**
 * Compiles the window-list helper if it's missing or out of date.
 *
 * Built universal (arm64 + x86_64): it ships inside the app, and users have no
 * Swift toolchain to build it themselves. An arm64-only binary would silently
 * cost every Intel Mac its hiding places.
 *
 * Without a toolchain at all she simply never finds a hiding place, so a
 * machine that can't build this still runs.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const run = promisify(execFile)
const SRC = 'tools/window-list.swift'
const OUT = 'tools/bin/window-list'
const TARGETS = [
  ['arm64', 'arm64-apple-macos11'],
  ['x64', 'x86_64-apple-macos11'],
]

async function isCurrent() {
  if (!existsSync(OUT)) return false
  if ((await stat(OUT)).mtimeMs < (await stat(SRC)).mtimeMs) return false
  // An older single-architecture build has to be replaced.
  try {
    const { stdout } = await run('lipo', ['-archs', OUT])
    return TARGETS.every(([, t]) => stdout.includes(t.split('-')[0]))
  } catch {
    return false
  }
}

if (await isCurrent()) {
  console.log('[helper] window-list is current (universal)')
  process.exit(0)
}

try {
  await run('swiftc', ['--version'])
} catch {
  console.warn('[helper] no swiftc -- skipping window-list; she will not find hiding places')
  process.exit(0)
}

await mkdir('tools/bin', { recursive: true })
const slices = []
try {
  for (const [name, target] of TARGETS) {
    const out = `tools/bin/window-list-${name}`
    await run('swiftc', ['-O', '-target', target, '-o', out, SRC])
    slices.push(out)
  }
  await run('lipo', ['-create', '-output', OUT, ...slices])
  const { stdout } = await run('lipo', ['-archs', OUT])
  console.log(`[helper] built window-list (${stdout.trim()})`)
} catch (err) {
  console.warn('[helper] window-list failed to build:', String(err.message).split('\n')[0])
} finally {
  await Promise.all(slices.map((f) => rm(f, { force: true })))
}
