# Youtube Downloader Desktop

Local desktop app with :
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
- `yt-dlp` executable file in `/bin` folder
- `nodejs` executable file in `/bin` folder
- `ffmpeg` executable file in `/bin` folder

```text
bin/yt-dlp.exe
```

Made with AI for personal purposes
