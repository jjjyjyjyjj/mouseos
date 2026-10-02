# Publishing a release

Free, no Apple Developer Program. The trick is Homebrew: `brew install --cask`
removes the quarantine flag, so an unsigned app launches with no Gatekeeper
warning. A plain download can't do that — only notarisation can, and that needs
the paid account.

## One-time: create the tap

Make a **second** public repo called exactly `homebrew-tap`, and put
[mouseos.rb](mouseos.rb) in it at `Casks/mouseos.rb`. That's the whole tap.

The official homebrew-cask repo has notability requirements (stars, forks) this
project won't meet yet. A personal tap has none and works identically for users.

## Each release

```bash
npm version patch          # or minor — bumps package.json and tags
git push && git push --tags
```

The tag triggers [.github/workflows/release.yml](../.github/workflows/release.yml),
which builds the universal `.dmg` on a macOS runner and attaches it to a GitHub
release. It prints the checksum in the log.

Then in the tap repo, update `version` and `sha256` in `Casks/mouseos.rb`.

To build locally instead:

```bash
npm run dist
shasum -a 256 release/*.dmg
```

## What users do

```bash
brew install --cask jjjyjyjyjj/tap/mouseos
```

Without Homebrew they download the `.dmg`, drag MouseOS to Applications, and
then have to clear the quarantine flag once:

```bash
xattr -dr com.apple.quarantine /Applications/MouseOS.app
```

They will hit a Gatekeeper wall without that, so keep it next to the download
link. Worth saying in the release notes too.

## First launch

macOS asks once for permission to control System Events — that's how she knows
which app is in front, and it drives the costumes. Declining costs only the
costumes; everything else works. Window positions, which she needs for hiding,
need no permission at all.

## If you ever get the $99 account

Set `CSC_LINK` and `CSC_KEY_PASSWORD` (the Developer ID certificate), add
`"notarize": true` under `build.mac`, and set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`
and `APPLE_TEAM_ID`. The ad-hoc signing hook steps aside on its own, and the
download becomes double-clickable with no instructions at all.
