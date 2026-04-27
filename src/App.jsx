import { useMemo, useState } from 'react'

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
  { label: 'Meilleure qualité', value: 'bestvideo+bestaudio/best' },
  { label: '1080p max', value: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' },
  { label: '720p max', value: 'bestvideo[height<=720]+bestaudio/best[height<=720]' },
  { label: 'Audio MP3', value: 'audio' }
]

export default function App() {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState(presets[0].value)
  const [outputDir, setOutputDir] = useState('')
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [embedThumbnail, setEmbedThumbnail] = useState(false)
  const [status, setStatus] = useState('Prêt')
  const [logs, setLogs] = useState('Aucun log pour le moment.')
  const [busy, setBusy] = useState(false)

  const videoId = useMemo(() => extractVideoId(url), [url])
  const previewImage = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''

  async function chooseFolder() {
    const folder = await window.desktopAPI.pickFolder()
    if (folder) setOutputDir(folder)
  }

  async function startDownload() {
    if (!url.trim()) {
      setStatus('Entre une URL valide.')
      return
    }

    setBusy(true)
    setStatus('Téléchargement en cours...')
    setLogs('')

    try {
      const result = await window.desktopAPI.downloadVideo({
        url,
        format,
        outputDir,
        embedMetadata,
        embedThumbnail
      })
      setLogs(result)
      setStatus('Téléchargement terminé.')
    } catch (error) {
      setLogs(String(error))
      setStatus('Erreur pendant le téléchargement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <main className="shell">
        <section className="hero">
          <p className="eyebrow">🎬 React + Electron + yt-dlp</p>
          <h1>Téléchargeur YouTube local</h1>
          <p className="subtitle">Colle une URL, vérifie l’aperçu, choisis ton format et lance le téléchargement en local.</p>
        </section>

        <section className="card">
          <label>
            🔗 URL YouTube
            <input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>

          <div className="grid2">
            <label>
              🎚️ Qualité
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {presets.map((preset) => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
              </select>
            </label>

            <label>
              📁 Dossier de sortie
              <div className="inlineRow">
                <input
                  type="text"
                  placeholder="Choisir un dossier"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                />
                <button type="button" className="secondaryBtn" onClick={chooseFolder}>Choisir</button>
              </div>
            </label>
          </div>

          <div className="checks">
            <label className="check"><input type="checkbox" checked={embedMetadata} onChange={(e) => setEmbedMetadata(e.target.checked)} /> 🧾 Métadonnées</label>
            <label className="check"><input type="checkbox" checked={embedThumbnail} onChange={(e) => setEmbedThumbnail(e.target.checked)} /> 🖼️ Miniature</label>
          </div>

          <button type="button" className="primaryBtn" onClick={startDownload} disabled={busy}>
            {busy ? 'Téléchargement...' : '⬇️ Télécharger'}
          </button>
        </section>

        <section className="card previewCard">
          {!videoId ? (
            <div className="emptyState">
              <div className="emptyIcon">🎥</div>
              <p>Entre une URL YouTube valide pour voir l’aperçu.</p>
            </div>
          ) : (
            <div className="previewGrid">
              <img src={previewImage} alt="Aperçu vidéo" />
              <div className="metaBox">
                <p><strong>ID :</strong> {videoId}</p>
                <p><strong>Statut :</strong> {status}</p>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2>📝 Logs</h2>
          <pre>{logs}</pre>
        </section>
      </main>
    </div>
  )
}
