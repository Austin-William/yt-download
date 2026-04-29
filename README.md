# Youtube Downloader Desktop

Local desktop app for **Windows** (MacOS not tested yet) with :
- React + Vite for the UI
- Electron for the desktop container
- `yt-dlp` + `ffmpeg` to download and process the video
- `nodejs` as Javascript runtime for yt-dlp to resolve any encountered problems

Application desktop locale avec :
- React + Vite pour l'interface
- Electron pour le conteneur desktop
- `yt-dlp.exe` appelé en local via Node.js

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build Windows application

```bash
npm run dist
```

## Required
```text
bin/yt-dlp.exe
bin/yt-dlp
bin/node.exe
bin/node
bin/ffmpeg.exe
bin/ffmpeg
```
> Important : Make sure executable files have enough rights for MacOS (no need for .exe files)

Made with AI for personal purposes
