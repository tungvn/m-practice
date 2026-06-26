# Lesson assets

Each subfolder here is **one lesson**: exactly one PDF plus zero or more MP3
tracks. The build scans this directory (`scripts/generate-manifest.mjs`) and
writes `manifest.json`, which the app loads at runtime.

```
public/assets/
  <Lesson Name>/
    <book>.pdf       # the readable / annotatable PDF
    1. <track>.mp3   # audio tracks (natural-sorted)
    2. <track>.mp3
```

## Why the folders look empty

The actual `*.pdf` and `*.mp3` files are **licensed content and are
gitignored** — they are intentionally not committed. The folders are kept as a
template (via `.gitkeep`) so the expected structure is clear.

## Getting content locally

- **Demo content:** `pnpm run sample-assets` generates throwaway PDFs + MP3s
  (needs `ffmpeg`), then run `pnpm run manifest`.
- **Real content:** drop your own licensed `<folder>/<file>.pdf` +
  `<file>.mp3` files in, then `pnpm run manifest` (or just `pnpm build`).
