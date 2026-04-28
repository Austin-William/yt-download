import { useEffect, useMemo, useRef, useState } from 'react'

function extractVideoId(value) {
  if (!value) return ''
  const trimmed = value.trim()

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&]+)/,
    /(?:youtu\.be\/)([^?&/]+)/,
    /(?:youtube\.com\/shorts\/)([^?&/]+)/,
    /(?:youtube\.com\/embed\/)([^?&/]+)/
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  return ''
}

const presets = [
  { label: 'Best quality', value: 'bestvideo+bestaudio/best' },
  { label: '1080p max', value: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' },
  { label: '720p max', value: 'bestvideo[height<=720]+bestaudio/best[height<=720]' },
  { label: 'MP3 audio', value: 'audio' }
]

function getLastLogLines(text, maxLines = 10) {
  if (!text) return 'No logs yet.'
  return text
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .slice(-maxLines)
    .join('\n')
}

export default function App() {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState(presets[0].value)
  const [outputDir, setOutputDir] = useState('')
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [embedThumbnail, setEmbedThumbnail] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [logs, setLogs] = useState('No logs yet.')
  const [busy, setBusy] = useState(false)
  const [container, setContainer] = useState('mp4')
  const [videoInfo, setVideoInfo] = useState(null)
  const [progress, setProgress] = useState(0)
  const [downloadPhase, setDownloadPhase] = useState('idle')
  const logsRef = useRef(null)

  const videoId = useMemo(() => extractVideoId(url), [url])
  const previewImage = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return 'N/A'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  function formatBytes(bytes) {
    if (!bytes) return 'N/A'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let index = 0

    while (value >= 1024 && index < units.length - 1) {
      value /= 1024
      index += 1
    }

    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`
  }

  async function chooseFolder() {
    const folder = await window.desktopAPI.pickFolder()
    if (folder) setOutputDir(folder)
  }

  async function startDownload() {
    if (!url.trim()) {
      setStatus('Enter a valid URL.')
      return
    }

    setBusy(true)
    setProgress(0)
    setDownloadPhase('downloading')
    setStatus('Downloading...')
    setLogs('')

    try {
      await window.desktopAPI.downloadVideo({
        url,
        format,
        container,
        outputDir,
        embedMetadata,
        embedThumbnail
      })
      setProgress(100)
      setDownloadPhase('completed')
      setStatus('Download completed.')
    } catch (error) {
      setLogs(String(error))
      setDownloadPhase('error')
      setStatus('Download failed.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!window.desktopAPI?.onDownloadLog) return

    const unsubscribe = window.desktopAPI.onDownloadLog((message) => {
      setLogs((prev) => {
        const current = prev === 'No logs yet.' ? '' : prev
        return current + message
      })
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    if (!url.trim() || !window.desktopAPI?.getVideoInfo) {
      setVideoInfo(null)
      return
    }

    const run = async () => {
      try {
        const info = await window.desktopAPI.getVideoInfo({
          url,
          format,
          container
        })
        setVideoInfo(info)
      } catch {
        setVideoInfo(null)
      }
    }

    run()
  }, [url, format, container])

  useEffect(() => {
    if (!window.desktopAPI?.onDownloadProgress) return

    const unsubscribe = window.desktopAPI.onDownloadProgress((value) => {
      setProgress(Number.isFinite(value) ? value : 0)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!window.desktopAPI?.onDownloadPhase) return

    const unsubscribe = window.desktopAPI.onDownloadPhase((value) => {
      setDownloadPhase(value)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return (
    <div className="page">
      <div className="shell">
        <header className="hero">
          <h1>YouTube Downloader</h1>
          <p className="subtitle">
            Paste a URL, check the preview, choose a format, and download locally.
          </p>
        </header>

        <section className="card">
          <label>
            YouTube URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>

          <div className="grid2">
            <label>
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {presets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              File type
              <select
                value={container}
                onChange={(e) => setContainer(e.target.value)}
                disabled={format === 'audio'}
              >
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
              </select>
            </label>

            <label>
              Output folder
              <div className="inlineRow">
                <input
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="Default downloads folder"
                />
                <button type="button" className="secondaryBtn" onClick={chooseFolder}>
                  Browse
                </button>
              </div>
            </label>
          </div>

          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                checked={embedMetadata}
                onChange={(e) => setEmbedMetadata(e.target.checked)}
              />
              Embed metadata
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={embedThumbnail}
                onChange={(e) => setEmbedThumbnail(e.target.checked)}
              />
              Embed thumbnail
            </label>
          </div>

          <button className="primaryBtn" onClick={startDownload} disabled={busy}>
            {busy ? 'Downloading...' : 'Start download'}
          </button>
        </section>

        <section className="card previewGrid">
          <div>
            {previewImage ? (
              <img src={previewImage} alt="Video preview" />
            ) : (
              <div className="emptyState">
                <div>
                  <div className="emptyIcon">🎬</div>
                  <p>Enter a valid YouTube URL to see the preview.</p>
                </div>
              </div>
            )}
          </div>

          <div className="metaBox">
            <p><strong>Title:</strong> {videoInfo?.title || 'N/A'}</p>
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Duration:</strong> {formatDuration(videoInfo?.duration)}</p>
            {format !== 'audio' && (
              <>
                <p><strong>File type:</strong> {container.toUpperCase()}</p>
                <p><strong>Resolution:</strong> {videoInfo?.resolution || 'N/A'}</p>
                <p><strong>Estimated size:</strong> {formatBytes(videoInfo?.estimatedSize)}</p>
              </>
            )}
            <p>
              <strong>Progress:</strong>{' '}
              {downloadPhase === 'converting'
                ? 'Converting...'
                : downloadPhase === 'completed'
                  ? 'Completed'
                  : downloadPhase === 'error'
                    ? 'Failed'
                    : `${Math.round(progress)}%`}
            </p>
            <div className={`progressBar ${downloadPhase}`}>
              <div
                className={`progressFill ${downloadPhase}`}
                style={{
                  width:
                    downloadPhase === 'completed'
                      ? '100%'
                      : downloadPhase === 'converting'
                        ? '100%'
                        : `${Math.max(0, Math.min(progress, 100))}%`
                }}
              />
            </div>

            <pre ref={logsRef} className="logsPre">{logs}</pre>
          </div>
        </section>
      </div>
    </div>
  )
}