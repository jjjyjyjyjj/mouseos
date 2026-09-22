// Prints the on-screen windows as JSON: id, owner, and bounds in global screen
// coordinates, front-to-back.
//
// CGWindowListCopyWindowInfo gives geometry and owner names with no permission
// prompt at all. Only window *titles* need Screen Recording, and we never ask
// for them -- which is the whole reason this is a Swift helper rather than the
// AppleScript route, where reading window positions needs assistive access.
import CoreGraphics
import Foundation

let excludePID = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) : nil

// Normal app windows only: no desktop icons, no menu bar, no wallpaper layer.
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]

guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    print("[]")
    exit(0)
}

var out: [[String: Any]] = []
for win in raw {
    // layer 0 is the ordinary window layer; anything else is a panel, a menu,
    // a floating palette -- or our own overlay.
    guard let layer = win[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
    if let alpha = win[kCGWindowAlpha as String] as? Double, alpha < 0.2 { continue }
    if let pid = win[kCGWindowOwnerPID as String] as? Int, pid == excludePID { continue }

    guard let bounds = win[kCGWindowBounds as String] as? [String: Any],
          let x = bounds["X"] as? Double,
          let y = bounds["Y"] as? Double,
          let w = bounds["Width"] as? Double,
          let h = bounds["Height"] as? Double,
          w >= 140, h >= 90
    else { continue }

    let number = win[kCGWindowNumber as String] as? Int ?? out.count
    out.append([
        "id": "cg\(number)",
        "owner": win[kCGWindowOwnerName as String] as? String ?? "?",
        "x": x, "y": y, "w": w, "h": h,
    ])
}

if let data = try? JSONSerialization.data(withJSONObject: out),
   let text = String(data: data, encoding: .utf8) {
    print(text)
} else {
    print("[]")
}
