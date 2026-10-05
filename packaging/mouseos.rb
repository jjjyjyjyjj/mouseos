# Homebrew cask for MouseOS.
#
# This file belongs in a *separate* repo named `homebrew-tap`, at
# Casks/mouseos.rb, so people can install with:
#
#   brew install --cask jjjyjyjyjj/tap/mouseos
#
# Homebrew strips the quarantine flag on install, which is what makes an
# unsigned app launch without the Gatekeeper warning. That's the whole reason
# to bother with a tap rather than just linking the .dmg.
#
# On each release, bump `version` and replace `sha256` with the output of:
#   shasum -a 256 release/MouseOS-<version>-universal.dmg
cask "mouseos" do
  version "0.1.0"
  sha256 "7623696dec969479806c75057f4bdf7e2b39dfbf82685647422913a231a63ce3"

  url "https://github.com/jjjyjyjyjj/mouseos/releases/download/v#{version}/MouseOS-#{version}-universal.dmg"
  name "MouseOS"
  desc "Hand-drawn mouse that lives on your desktop"
  homepage "https://github.com/jjjyjyjyjj/mouseos"

  app "MouseOS.app"

  zap trash: [
    "~/Library/Application Support/mouseos",
    "~/Library/Saved Application State/com.jjjyjyjyjj.mouseos.savedState",
  ]
end
