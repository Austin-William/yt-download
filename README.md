# yt-dlp Electron App

Application desktop locale avec :
- React + Vite pour l'interface
- Electron pour le conteneur desktop
- `yt-dlp.exe` appelé en local via Node.js

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Build application Windows

```bash
npm run dist
```

## Important

Place `yt-dlp.exe` dans le dossier suivant avant de lancer l'app :

```text
bin/yt-dlp.exe
```

En build packagé, `electron-builder` copie automatiquement ce binaire dans `resources/bin/yt-dlp.exe` via `extraResources`.
