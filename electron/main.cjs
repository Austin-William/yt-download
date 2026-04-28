const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const isDev = !app.isPackaged

function getYtDlpPath() {
  let binaryName

  if (process.platform === 'win32') {
    binaryName = 'yt-dlp.exe'
  } else if (process.platform === 'darwin') {
    binaryName = 'yt-dlp'
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  if (isDev) {
    return path.join(__dirname, '..', 'bin', binaryName)
  }

  return path.join(process.resourcesPath, 'bin', binaryName)
}

function ensureExecutable(filePath) {
  if (process.platform !== 'darwin') return

  try {
    fs.chmodSync(filePath, 0o755)
  } catch (error) {
    console.warn(`Failed to set executable permission on ${filePath}:`, error.message)
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1150,
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

ipcMain.handle('get-video-info', async (_event, payload) => {
  const exePath = getYtDlpPath()
  ensureExecutable(exePath)

  return await new Promise((resolve, reject) => {
    const args = ['-J', '--no-playlist', payload.url]
    const child = spawn(exePath, args, { windowsHide: true })

    let output = ''
    let errorOutput = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    child.on('close', () => {
      try {
        const data = JSON.parse(output)
        const formats = Array.isArray(data.formats) ? data.formats : []

        const maxHeight =
          payload.format === 'bestvideo[height<=720]+bestaudio/best[height<=720]'
            ? 720
            : payload.format === 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
              ? 1080
              : Infinity

        const preferredExt = payload.container === 'mkv' ? null : 'mp4'

        const videoFormats = formats.filter((f) => {
          const hasVideo = f.vcodec && f.vcodec !== 'none'
          const noAudio = !f.acodec || f.acodec === 'none'
          const okHeight = !f.height || f.height <= maxHeight
          const okExt = preferredExt ? f.ext === preferredExt : true
          return hasVideo && noAudio && okHeight && okExt
        })

        const audioFormats = formats.filter((f) => {
          const hasAudio = f.acodec && f.acodec !== 'none'
          const noVideo = !f.vcodec || f.vcodec === 'none'
          return hasAudio && noVideo
        })

        const bestVideo = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0]
        const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0]

        const videoSize = bestVideo?.filesize || bestVideo?.filesize_approx || 0
        const audioSize = bestAudio?.filesize || bestAudio?.filesize_approx || 0
        const totalSize = videoSize + audioSize

        resolve({
          duration: data.duration || null,
          resolution: bestVideo?.height ? `${bestVideo.height}p` : 'Unknown',
          estimatedSize: totalSize || null,
          title: data.title || ''
        })
      } catch (error) {
        reject(errorOutput || error.message)
      }
    })

    child.on('error', (error) => {
      reject(error.message)
    })
  })
})

ipcMain.handle('download-video', async (event, payload) => {
  const exePath = getYtDlpPath()
  const args = []

  if (payload.format === 'audio') {
    args.push('-x', '--audio-format', 'mp3')
  } else {
    args.push('-f', payload.format)
    args.push('-S', 'res,ext:mp4:m4a')
    args.push('--recode-video', payload.container || 'mp4')
  }

  const outputDir =
    payload.outputDir && payload.outputDir.trim()
      ? payload.outputDir.trim()
      : app.getPath('downloads')

  args.push('-o', path.join(outputDir, '%(title)s.%(ext)s'))
  args.push('--no-playlist')

  if (payload.embedMetadata) args.push('--embed-metadata')
  if (payload.embedThumbnail) args.push('--embed-thumbnail')

  args.push(payload.url)

  return await new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { windowsHide: true })
    let output = ''

    const pushLog = (chunk) => {
      const text = chunk.toString()
      output += text
      event.sender.send('download-log', text)
    }

    child.stdout.on('data', pushLog)
    child.stderr.on('data', pushLog)

    child.on('close', (code) => {
      if (code === 0) resolve(output || 'Download completed.\n')
      else reject(output || `Error code ${code}\n`)
    })

    child.on('error', (error) => {
      reject(error.message)
    })
  })
})
