/**
 * The overlay shell.
 *
 * One transparent, click-through, always-on-top window stretched over the real
 * desktop. Everything the mouse perceives has to be pulled from the OS, because
 * a click-through window receives no input events of its own:
 *
 *   cursor        screen.getCursorScreenPoint(), polled
 *   idleness      powerMonitor.getSystemIdleTime() -- real system idle
 *   frontmost app osascript, polled
 *
 * The renderer tells us when the pointer is over her so we can briefly stop
 * ignoring mouse events -- that's the hole in the click-through that lets you
 * poke her, and pick her up.
 *
 * She lives in the menu bar, not the Dock. Turning her off stops the window
 * *and* every poll, so a disabled mouse costs nothing.
 */
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  screen,
  ipcMain,
  nativeImage,
  powerMonitor,
  globalShortcut,
} = require('electron')
const { execFile } = require('node:child_process')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const DEV = process.argv.includes('--dev')
// You cannot click into a click-through overlay to inspect it, so --probe
// prints the critter's state to the terminal instead.
const PROBE = process.argv.includes('--probe')

const CURSOR_HZ = 60
// Both of these spawn a process every time. At the old rates -- 1.2s and 0.9s
// -- that was 117 spawns a minute, forever, which is enough to show up in
// "Apps Using Significant Energy". Neither piece of information changes fast:
// the frontmost app rarely, and window positions only when you move a window.
// Hiding still gets fresh geometry because the page asks for a refresh the
// moment she's frightened.
const APP_POLL_MS = 2500
const WINDOW_POLL_MS = 3000
/** Floor between on-demand window refreshes, so fright can't spam the helper. */
const WINDOW_REFRESH_MIN_MS = 600
// She can only convincingly hide against a window that's actually in front.
const HIDEABLE_WINDOWS = 5
const TOGGLE_ACCELERATOR = 'Control+Alt+M'

let win = null
let tray = null
let timers = []

/* ------------------------------------------------------------------ */
/* settings                                                            */

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    return { enabled: true, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) }
  } catch {
    return { enabled: true }
  }
}

function saveSettings() {
  try {
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error('[mouseos] could not save settings:', err.message)
  }
}

const settings = loadSettings()

/* ------------------------------------------------------------------ */
/* window                                                              */

/**
 * One overlay across every screen, so she can walk onto a second monitor
 * instead of being penned into the main one.
 *
 * Work areas rather than full bounds: macOS won't let a window sit under the
 * menu bar, and using bounds just pushes the frame down and clips the bottom.
 */
function overlayBounds() {
  const areas = screen.getAllDisplays().map((d) => d.workArea)
  const left = Math.min(...areas.map((a) => a.x))
  const top = Math.min(...areas.map((a) => a.y))
  const right = Math.max(...areas.map((a) => a.x + a.width))
  const bottom = Math.max(...areas.map((a) => a.y + a.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function createWindow() {
  const { x, y, width, height } = overlayBounds()

  win = new BrowserWindow({
    x, y, width, height,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Never steal focus from whatever you're actually working in.
    focusable: false,
    // 'panel' floats above normal windows without becoming a real app window.
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // or she freezes the moment you look away
    },
  })

  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (DEV) win.loadURL('http://localhost:5183/')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // The renderer stops its own loop when she's off, so a disabled mouse isn't
  // quietly simulating herself in a hidden window.
  win.webContents.on('did-finish-load', () => send('enabled', settings.enabled))

  if (PROBE) attachProbe()
  return win
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/* ------------------------------------------------------------------ */
/* perception                                                          */

function startPerception() {
  if (timers.length) return

  timers.push(
    setInterval(() => {
      if (!win || win.isDestroyed()) return
      const p = screen.getCursorScreenPoint()
      const b = win.getBounds()
      send('cursor', { x: p.x - b.x, y: p.y - b.y })
    }, Math.round(1000 / CURSOR_HZ)),
  )

  // Real system idle, in seconds.
  timers.push(setInterval(() => send('idle', powerMonitor.getSystemIdleTime()), 100))

  // Where everyone else's windows are, so she has something to hide against.
  // The overlay is always-on-top and can never truly sit behind another app's
  // window -- but it doesn't need to, because the hiding frames have their
  // occlusion drawn in. Lining a drawn edge up with a real one is enough.
  // Packaged, the helper sits in Resources and not inside the asar -- an
  // executable can't be run from in there, and this path wouldn't exist anyway.
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'window-list')
    : path.join(__dirname, '..', 'tools', 'bin', 'window-list')
  if (existsSync(helper)) {
    timers.push(
      setInterval(() => {
        if (!win || win.isDestroyed()) return
        execFile(helper, [String(process.pid)], { timeout: 2000 }, (err, stdout) => {
          if (err || !win || win.isDestroyed()) return
          let list
          try {
            list = JSON.parse(stdout)
          } catch {
            return
          }
          const b = win.getBounds()
          const local = []
          for (const w of list) {
            // Global screen coordinates -> coordinates inside the overlay.
            const left = w.x - b.x
            const top = w.y - b.y
            // >= : a window starting exactly at our right edge is on the next display
            if (left + w.w <= 0 || left >= b.width || top + w.h <= 0 || top >= b.height) continue
            local.push({ id: w.id, owner: w.owner, left, top, width: w.w, height: w.h })
            if (local.length >= HIDEABLE_WINDOWS) break
          }
          send('windows', local)
        })
      }, WINDOW_POLL_MS),
    )
  } else {
    console.warn('[mouseos] tools/bin/window-list missing -- she will not find hiding places')
  }

  // Frontmost application. Needs Accessibility permission the first time; if
  // it's denied we just never learn the app name and she carries on without
  // costumes.
  const SCRIPT =
    'tell application "System Events" to get name of first application process whose frontmost is true'
  let lastApp = null
  timers.push(
    setInterval(() => {
      execFile('osascript', ['-e', SCRIPT], { timeout: 2000 }, (err, stdout) => {
        if (err) return
        const name = stdout.trim()
        if (!name || name === lastApp) return
        lastApp = name
        send('app', name)
      })
    }, APP_POLL_MS),
  )
}

function helperPath() {
  // Packaged, the helper sits in Resources and not inside the asar -- an
  // executable can't be run from in there, and this path wouldn't exist anyway.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'window-list')
    : path.join(__dirname, '..', 'tools', 'bin', 'window-list')
}

let lastWindowRead = 0

/** Run the helper and push everyone else's windows, in overlay coordinates. */
function readWindows() {
  if (!win || win.isDestroyed() || !settings.enabled) return
  lastWindowRead = Date.now()
  execFile(helperPath(), [String(process.pid)], { timeout: 2000 }, (err, stdout) => {
    if (err || !win || win.isDestroyed()) return
    let list
    try {
      list = JSON.parse(stdout)
    } catch {
      return
    }
    const b = win.getBounds()
    const local = []
    for (const w of list) {
      // Global screen coordinates -> coordinates inside the overlay.
      const left = w.x - b.x
      const top = w.y - b.y
      // >= : a window starting exactly at our right edge is on the next display
      if (left + w.w <= 0 || left >= b.width || top + w.h <= 0 || top >= b.height) continue
      local.push({ id: w.id, owner: w.owner, left, top, width: w.w, height: w.h })
      if (local.length >= HIDEABLE_WINDOWS) break
    }
    send('windows', local)
  })
}

/** She's frightened and about to look for cover -- make sure it's current. */
ipcMain.on('windows:refresh', () => {
  if (Date.now() - lastWindowRead < WINDOW_REFRESH_MIN_MS) return
  readWindows()
})

function stopPerception() {
  timers.forEach(clearInterval)
  timers = []
}

// Nothing to watch behind a locked screen, and nobody to watch it.
powerMonitor.on('lock-screen', () => {
  send('idle', 999)
  stopPerception()
})
powerMonitor.on('unlock-screen', () => {
  if (settings.enabled) startPerception()
})

/** The renderer opens a hole in the click-through when the pointer is over her. */
ipcMain.on('clickable', (_e, clickable) => {
  if (win && !win.isDestroyed() && settings.enabled) {
    win.setIgnoreMouseEvents(!clickable, { forward: true })
  }
})

/* ------------------------------------------------------------------ */
/* on / off                                                            */

function setEnabled(on) {
  settings.enabled = !!on
  saveSettings()

  if (!win || win.isDestroyed()) return
  send('enabled', settings.enabled)

  if (settings.enabled) {
    win.showInactive()
    startPerception()
  } else {
    // Stop the polls too -- a mouse that's switched off should cost nothing.
    stopPerception()
    win.setIgnoreMouseEvents(true, { forward: true })
    win.hide()
  }
  buildTrayMenu()
}

function buildTrayMenu() {
  if (!tray) return
  tray.setToolTip(settings.enabled ? 'MouseOS — she\'s out' : 'MouseOS — off')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mouse on screen',
        type: 'checkbox',
        checked: settings.enabled,
        accelerator: TOGGLE_ACCELERATOR,
        click: (item) => setEnabled(item.checked),
      },
      { type: 'separator' },
      {
        label: 'Open at login',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }),
      },
      { type: 'separator' },
      { label: 'Quit MouseOS', role: 'quit' },
    ]),
  )
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png'))
  icon.setTemplateImage(true) // macOS tints it for light and dark menu bars
  tray = new Tray(icon)
  buildTrayMenu()
}

/* ------------------------------------------------------------------ */

function attachProbe() {
  win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg))
  setInterval(async () => {
    if (!win || win.isDestroyed()) return
    try {
      const status = await win.webContents.executeJavaScript('window.mouseos.status')
      const b = win.getBounds()
      console.log(
        `[probe] enabled=${settings.enabled} visible=${win.isVisible()} ` +
          `overlay=${b.width}x${b.height}@${b.x},${b.y} displays=${screen.getAllDisplays().length}\n${status}`,
      )
    } catch (err) {
      console.log('[probe] renderer not ready:', err.message)
    }
  }, 2000)
}

app.whenReady().then(() => {
  // Menu-bar app, not a Dock app.
  app.dock?.hide()

  createWindow()
  buildTray()
  setEnabled(settings.enabled)

  // Follow display changes rather than stranding her off screen.
  // Follow monitors being added, removed or rearranged.
  const refit = () => {
    if (!win || win.isDestroyed()) return
    win.setBounds(overlayBounds())
    readWindows()
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-added', refit)
  screen.on('display-removed', refit)

  globalShortcut.register(TOGGLE_ACCELERATOR, () => setEnabled(!settings.enabled))
})

app.on('will-quit', () => {
  stopPerception()
  globalShortcut.unregisterAll()
})

// Menu-bar apps stay alive with no windows showing.
app.on('window-all-closed', () => {})
