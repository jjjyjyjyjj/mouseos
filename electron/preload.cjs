const { contextBridge, ipcRenderer } = require('electron')

/**
 * The only surface the page gets. Everything below is read-only perception
 * except setClickable, which punches the hole in the click-through region.
 */
contextBridge.exposeInMainWorld('mouseNative', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  /** Real system idle time, in seconds. */
  onIdle: (cb) => ipcRenderer.on('idle', (_e, s) => cb(s)),
  /** Frontmost application name, e.g. "Code", "Spotify", "Finder". */
  onApp: (cb) => ipcRenderer.on('app', (_e, n) => cb(n)),
  setClickable: (yes) => ipcRenderer.send('clickable', !!yes),
})
