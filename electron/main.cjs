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
 * poke her.
 */
const { app, BrowserWindow, screen, ipcMain, powerMonitor, globalShortcut } = require('electron')
const { execFile } = require('node:child_process')
const path = require('node:path')

const DEV = process.argv.includes('--dev')
// You cannot click into a click-through overlay to inspect it, so --probe
// prints the critter's state to the terminal instead.
const PROBE = process.argv.includes('--probe')
const CURSOR_HZ = 60
const APP_POLL_MS = 1200

let win = null
let timers = []

function createWindow() {
  const display = screen.getPrimaryDisplay()
  // workArea, not bounds: macOS will not let a window sit under the menu bar,
  // and using bounds just pushes the frame down and clips the bottom strip.
  const { x, y, width, height } = display.workArea

  win = new BrowserWindow({
    x, y, width, height,
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

  win.showInactive()
  return win
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function startPerception() {
  // --- cursor -----------------------------------------------------------
  timers.push(
    setInterval(() => {
      if (!win || win.isDestroyed()) return
      const p = screen.getCursorScreenPoint()
      const b = win.getBounds()
      send('cursor', { x: p.x - b.x, y: p.y - b.y })
    }, Math.round(1000 / CURSOR_HZ)),
  )

  // --- real system idle, in seconds -------------------------------------
  timers.push(setInterval(() => send('idle', powerMonitor.getSystemIdleTime()), 1000))
  powerMonitor.on('lock-screen', () => send('idle', 999))

  // --- frontmost application --------------------------------------------
  // Needs Accessibility permission the first time; if it's denied we just
  // never learn the app name and she carries on without costumes.
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

/** The renderer opens a hole in the click-through when the pointer is over her. */
ipcMain.on('clickable', (_e, clickable) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!clickable, { forward: true })
})

app.whenReady().then(() => {
  createWindow()
  startPerception()

  // Follow display changes rather than stranding her off screen.
  screen.on('display-metrics-changed', () => {
    if (!win || win.isDestroyed()) return
    win.setBounds(screen.getPrimaryDisplay().workArea)
  })

  if (PROBE) {
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg))
    timers.push(
      setInterval(async () => {
        if (!win || win.isDestroyed()) return
        try {
          const status = await win.webContents.executeJavaScript('window.mouseos.status')
          console.log(`[probe] visible=${win.isVisible()} bounds=${JSON.stringify(win.getBounds())}\n${status}`)
        } catch (err) {
          console.log('[probe] renderer not ready:', err.message)
        }
      }, 2000),
    )
  }

  globalShortcut.register('Control+Alt+M', () => {
    if (!win || win.isDestroyed()) return
    win.isVisible() ? win.hide() : win.showInactive()
  })
})

app.on('will-quit', () => {
  timers.forEach(clearInterval)
  timers = []
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => app.quit())
