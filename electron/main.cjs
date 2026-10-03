const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const isDev = !app.isPackaged
let activeDownload = null
const activeProcesses = new Set()

function trackProcess(child) {
  activeProcesses.add(child)
  child.once('close', () => activeProcesses.delete(child))
  child.once('error', () => activeProcesses.delete(child))
  return child
}

function controlDownloadProcess(pid, action) {
  if (process.platform === 'win32') {
    const source = [
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class ProcessControl {',
      '[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
      '[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr process);',
      '[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr process);',
      '[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);',
      '}'
    ].join(' ')
    const method = action === 'pause' ? 'NtSuspendProcess' : 'NtResumeProcess'
    const script = `Add-Type '${source}'; $processes = @(Get-CimInstance Win32_Process); $ids = [System.Collections.Generic.List[int]]::new(); $ids.Add(${pid}); for ($index = 0; $index -lt $ids.Count; $index++) { foreach ($process in $processes) { $processId = [int]$process.ProcessId; if ([int]$process.ParentProcessId -eq $ids[$index] -and -not $ids.Contains($processId)) { $ids.Add($processId) } } }; if ('${action}' -eq 'pause') { $ids.Reverse() }; foreach ($processId in $ids) { $handle = [ProcessControl]::OpenProcess(0x0800, $false, $processId); if ($handle -eq [IntPtr]::Zero) { if ($processId -eq ${pid}) { throw 'Unable to open download process.' }; continue }; $result = [ProcessControl]::${method}($handle); [ProcessControl]::CloseHandle($handle) | Out-Null; if ($result -ne 0) { throw 'Unable to control download process.' } }`

    return new Promise((resolve, reject) => {
      const powershell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
      let errorOutput = ''
      powershell.stderr.on('data', (data) => { errorOutput += data.toString() })
      powershell.on('error', reject)
      powershell.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(errorOutput || 'Unable to control download process.'))
      })
    })
  }

  process.kill(-pid, action === 'pause' ? 'SIGSTOP' : 'SIGCONT')
  return Promise.resolve()
}

function terminateDownloadProcess(child) {
  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      let errorOutput = ''
      taskkill.stderr.on('data', (data) => { errorOutput += data.toString() })
      taskkill.on('error', reject)
      taskkill.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(errorOutput || 'Unable to cancel download.'))
      })
    })
  }

  process.kill(-child.pid, 'SIGTERM')
  return Promise.resolve()
}

async function stopProcess(child) {
  if (child.exitCode !== null) return

  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    await terminateDownloadProcess(child)
  } catch (error) {
    if (child.exitCode !== null) return
    throw error
  }

  if (child.exitCode === null) await closed
}

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

function getFfmpegPath() {
  let binaryName

  if (process.platform === 'win32') {
    binaryName = 'ffmpeg.exe'
  } else if (process.platform === 'darwin') {
    binaryName = 'ffmpeg'
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  if (isDev) {
    return path.join(__dirname, '..', 'bin', binaryName)
  }

  return path.join(process.resourcesPath, 'bin', binaryName)
}

function getNodePath() {
  let binaryName

  if (process.platform === 'win32') {
    binaryName = 'node.exe'
  } else if (process.platform === 'darwin') {
    binaryName = 'node'
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
    autoHideMenuBar: true,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  let closePromptOpen = false
  let allowClose = false

  win.on('close', (event) => {
    if (allowClose || (!activeDownload && activeProcesses.size === 0)) return

    event.preventDefault()
    if (closePromptOpen) return
    closePromptOpen = true

    void (async () => {
      if (activeDownload) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Download in progress',
          message: 'A download is in progress. Quit and stop it?',
          buttons: ['Quit', 'Keep downloading'],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        })

        if (response !== 0) {
          closePromptOpen = false
          return
        }
      }

      if (activeDownload) activeDownload.cancelled = true

      try {
        await Promise.all([...activeProcesses].map(stopProcess))
        allowClose = true
        win.close()
      } catch (error) {
        await dialog.showMessageBox(win, {
          type: 'error',
          title: 'Unable to quit',
          message: `The download process could not be stopped: ${error.message || error}`,
          buttons: ['OK']
        })
        closePromptOpen = false
      }
    })()
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
  const nodePath = getNodePath()
  const ffmpegPath = getFfmpegPath()

  ensureExecutable(exePath)
  ensureExecutable(nodePath)
  ensureExecutable(ffmpegPath)

  return await new Promise((resolve, reject) => {
    const args = [
      '--no-js-runtimes',
      '--js-runtimes', `node:${nodePath}`,
      '--ffmpeg-location', ffmpegPath,
      ...(payload.format !== 'audio' ? ['-f', payload.format, '-S', 'res,ext:mp4:m4a'] : []),
      '-J',
      '--no-playlist',
      payload.url
    ]
    const child = trackProcess(spawn(exePath, args, {
      windowsHide: true,
      detached: process.platform !== 'win32'
    }))

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
        const requestedFormats = Array.isArray(data.requested_formats) ? data.requested_formats : []
        const requestedSizes = requestedFormats.map((format) => format.filesize ?? format.filesize_approx)
        const videoFormat = requestedFormats.find((format) => format.vcodec && format.vcodec !== 'none')
        const selectedSize =
          requestedFormats.length > 0 && requestedSizes.every((size) => Number.isFinite(size) && size > 0)
            ? requestedSizes.reduce((total, size) => total + size, 0)
            : null
        const totalSize = selectedSize || data.filesize || data.filesize_approx || null

        resolve({
          duration: data.duration || null,
          resolution: videoFormat?.height
            ? `${videoFormat.height}p`
            : data.height
              ? `${data.height}p`
              : 'Unknown',
          estimatedSize: totalSize,
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
  if (activeDownload) throw new Error('A download is already running.')

  const exePath = getYtDlpPath()
  const nodePath = getNodePath()
  const ffmpegPath = getFfmpegPath()
  const args = []

  ensureExecutable(exePath)
  ensureExecutable(nodePath)
  ensureExecutable(ffmpegPath)

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

  args.push('--no-js-runtimes')
  args.push('--js-runtimes', `node:${nodePath}`)
  args.push('--ffmpeg-location', ffmpegPath)

  args.push(
    '--newline',
    '--progress-template',
    'PROGRESS|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s'
  )

  args.push('-o', path.join(outputDir, '%(title)s.%(ext)s'))
  args.push('--no-playlist')

  if (payload.embedMetadata) args.push('--embed-metadata')
  if (payload.embedThumbnail) args.push('--embed-thumbnail')

  args.push(payload.url)

  return await new Promise((resolve, reject) => {
    const child = trackProcess(spawn(exePath, args, { windowsHide: true, detached: process.platform !== 'win32' }))
    const download = { child, cancelled: false, paused: false }
    activeDownload = download
    let output = ''
    let buffer = ''

    const handleChunk = (chunk) => {
      const text = chunk.toString()
      output += text
      buffer += text

      event.sender.send('download-log', text)

      const lowerText = text.toLowerCase()

      if (
        lowerText.includes('ffmpeg') ||
        lowerText.includes('merging formats') ||
        lowerText.includes('merging') ||
        lowerText.includes('recoding') ||
        lowerText.includes('converting') ||
        lowerText.includes('post-processing')
      ) {
        event.sender.send('download-phase', 'converting')
      }

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const match = line.match(/^PROGRESS\|\s*([\d.]+)%\|/i)
        if (match) {
          const percent = Math.min(100, Math.max(0, parseFloat(match[1])))
          event.sender.send('download-phase', 'downloading')
          event.sender.send('download-progress', percent)
        }
      }
    }

    child.stdout.on('data', handleChunk)
    child.stderr.on('data', handleChunk)

    child.on('close', (code) => {
      if (activeDownload === download) activeDownload = null
      if (download.cancelled) {
        event.sender.send('download-phase', 'cancelled')
        reject('Download cancelled.')
        return
      }
      if (code === 0) {
        event.sender.send('download-phase', 'completed')
        event.sender.send('download-progress', 100)
        resolve(output || 'Download completed.\n')
      } else {
        event.sender.send('download-phase', 'error')
        reject(output || `Error code ${code}\n`)
      }
    })

    child.on('error', (error) => {
      if (activeDownload === download) activeDownload = null
      reject(error.message)
    })
  })
})

ipcMain.handle('pause-download', async () => {
  if (!activeDownload || activeDownload.paused) return false
  await controlDownloadProcess(activeDownload.child.pid, 'pause')
  activeDownload.paused = true
  return true
})

ipcMain.handle('resume-download', async () => {
  if (!activeDownload || !activeDownload.paused) return false
  await controlDownloadProcess(activeDownload.child.pid, 'resume')
  activeDownload.paused = false
  return true
})

ipcMain.handle('cancel-download', async () => {
  if (!activeDownload) return false
  activeDownload.cancelled = true
  await terminateDownloadProcess(activeDownload.child)
  return true
})