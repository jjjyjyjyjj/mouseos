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
const { readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const DEV = process.argv.includes('--dev')
// You cannot click into a click-through overlay to inspect it, so --probe
// prints the critter's state to the terminal instead.
const PROBE = process.argv.includes('--probe')

const CURSOR_HZ = 60
const APP_POLL_MS = 1200
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

function createWindow() {
  const display = screen.getPrimaryDisplay()
  // workArea, not bounds: macOS will not let a window sit under the menu bar,
  // and using bounds just pushes the frame down and clips the bottom strip.
  const { x, y, width, height } = display.workArea

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
  timers.push(setInterval(() => send('idle', powerMonitor.getSystemIdleTime()), 1000))

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

function stopPerception() {
  timers.forEach(clearInterval)
  timers = []
}

powerMonitor.on('lock-screen', () => send('idle', 999))

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
      console.log(`[probe] enabled=${settings.enabled} visible=${win.isVisible()}\n${status}`)
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
  screen.on('display-metrics-changed', () => {
    if (!win || win.isDestroyed()) return
    win.setBounds(screen.getPrimaryDisplay().workArea)
  })

  globalShortcut.register(TOGGLE_ACCELERATOR, () => setEnabled(!settings.enabled))
})

app.on('will-quit', () => {
  stopPerception()
  globalShortcut.unregisterAll()
})

// Menu-bar apps stay alive with no windows showing.
app.on('window-all-closed', () => {})
