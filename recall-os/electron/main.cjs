const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

function handleSquirrelEvent() {
  if (process.platform !== 'win32') {
    return false
  }

  const command = process.argv[1]
  const executableName = path.basename(process.execPath)
  const updateExecutable = path.resolve(path.dirname(process.execPath), '..', 'Update.exe')

  const runUpdate = (args) => {
    spawn(updateExecutable, args, { detached: true }).on('close', () => app.quit())
  }

  if (command === '--squirrel-install' || command === '--squirrel-updated') {
    runUpdate([`--createShortcut=${executableName}`])
    return true
  }

  if (command === '--squirrel-uninstall') {
    runUpdate([`--removeShortcut=${executableName}`])
    return true
  }

  if (command === '--squirrel-obsolete') {
    app.quit()
    return true
  }

  return false
}

handleSquirrelEvent()

const APP_SCHEME = 'recall'
const APP_HOST = 'desktop'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const DIST_DIRECTORY = path.join(__dirname, '..', 'dist')
let backupSequence = 0

ipcMain.handle('recall:save-backup', async (event, data) => {
  if (!event.sender.getURL().startsWith(`${APP_ORIGIN}/`)) throw new Error('Untrusted backup source')
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0 || !Array.isArray(data.courses)) {
    return false
  }
  const content = JSON.stringify(data, null, 2)
  if (content.length > 100_000_000) throw new Error('Backup exceeds 100 MB')
  const directory = path.join(app.getPath('documents'), 'Recall OS Backups')
  await fs.mkdir(directory, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(directory, `study-data-${timestamp}-${++backupSequence}.json`)
  await fs.writeFile(file, content, { flag: 'wx' })
  return true
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

app.setName('Recall OS')
app.setPath('userData', path.join(app.getPath('appData'), 'Recall OS'))
app.setAppUserModelId('com.squirrel.RecallOS.RecallOS')

function resolveAppAsset(requestUrl) {
  const url = new URL(requestUrl)

  if (url.host !== APP_HOST) {
    return null
  }

  let requestedAsset
  try {
    requestedAsset = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }

  if (!requestedAsset || requestedAsset.endsWith('/')) {
    requestedAsset = `${requestedAsset}index.html`
  }

  const resolvedPath = path.resolve(DIST_DIRECTORY, requestedAsset)
  const relativePath = path.relative(DIST_DIRECTORY, resolvedPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null
  }

  return resolvedPath
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 640,
    minHeight: 520,
    backgroundColor: '#090d16',
    autoHideMenuBar: true,
    show: false,
    title: 'Recall OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith(`${APP_ORIGIN}/`)) {
      event.preventDefault()
    }
  })

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  await protocol.handle(APP_SCHEME, (request) => {
    const assetPath = resolveAppAsset(request.url)

    if (!assetPath) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(assetPath).toString())
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
