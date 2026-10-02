/**
 * electron-builder afterPack hook: ad-hoc sign the bundle.
 *
 * Without this the app ships "not signed at all" -- only Electron's own binary
 * carries a linker signature and the bundle's resources are unsealed. That
 * matters beyond Gatekeeper: macOS keys Automation and Accessibility grants to
 * the signature, so an unsealed bundle can lose its permissions.
 *
 * Ad-hoc signing is free and needs no Apple account. It does NOT get past
 * Gatekeeper on a downloaded app -- only notarisation does, which needs the
 * paid Developer Program. Homebrew sidesteps that by removing the quarantine
 * flag on install.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  // A universal build packs each architecture into its own -temp directory and
  // then merges them, and the merge requires every non-binary file to match.
  // Signing a temp build writes a different CodeResources per architecture and
  // the merge refuses. Sign only the merged app.
  if (context.appOutDir.includes('-temp')) return

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed  ${path.basename(app)}`)
}
