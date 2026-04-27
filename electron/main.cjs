const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const isDev = !app.isPackaged

function getYtDlpPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'bin', 'yt-dlp.exe')
  }
  return path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? '' : result.filePaths[0]
})

ipcMain.handle('download-video', async (_event, payload) => {
  const exePath = getYtDlpPath()

  const args = []

  if (payload.format === 'audio') {
    args.push('-x', '--audio-format', 'mp3')
  } else {
    args.push('-f', payload.format)
  }

  const outputDir = payload.outputDir && payload.outputDir.trim() ? payload.outputDir.trim() : app.getPath('downloads')
  args.push('-o', path.join(outputDir, '%(title)s.%(ext)s'))
  args.push('--no-playlist')

  if (payload.embedMetadata) args.push('--embed-metadata')
  if (payload.embedThumbnail) args.push('--embed-thumbnail')

  args.push(payload.url)

  return await new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { windowsHide: true })
    let output = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      output += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) resolve(output || 'Téléchargement terminé.')
      else reject(output || `Erreur code ${code}`)
    })

    child.on('error', (error) => {
      reject(error.message)
    })
  })
})
