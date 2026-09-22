#!/usr/bin/env node
/**
 * Compiles the window-list helper if it's missing or out of date.
 *
 * Without it she simply never finds a hiding place -- the overlay still runs,
 * so a machine with no Swift toolchain degrades instead of failing.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const run = promisify(execFile)
const SRC = 'tools/window-list.swift'
const OUT = 'tools/bin/window-list'

const fresh = async () => {
  if (!existsSync(OUT)) return false
  return (await stat(OUT)).mtimeMs >= (await stat(SRC)).mtimeMs
}

if (await fresh()) {
  console.log('[helper] window-list is current')
  process.exit(0)
}

try {
  await run('swiftc', ['--version'])
} catch {
  console.warn('[helper] no swiftc -- skipping window-list; she will not find hiding places')
  process.exit(0)
}

await mkdir('tools/bin', { recursive: true })
try {
  await run('swiftc', ['-O', '-o', OUT, SRC])
  console.log('[helper] built window-list')
} catch (err) {
  console.warn('[helper] window-list failed to build:', err.message.split('\n')[0])
}
