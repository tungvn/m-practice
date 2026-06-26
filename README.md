# Practice — PDF annotator + audio player

An offline-first, iPad-friendly reading app. Browse lessons, read a PDF, draw on
top of it with an Apple Pencil, and play the lesson's audio. Everything runs in
the browser — **no backend, no login, no remote database**. Annotations are
saved on-device in IndexedDB, and the site is a static export deployable to
Cloudflare Pages.

## Features

- **Lesson library** — one card per folder under `public/assets/`.
- **Full PDF preview** — all pages, scrollable, sized to the screen.
- **Pencil drawing layer** — a transparent canvas *above* the PDF (the PDF file
  is never modified). Pen + eraser, colors, sizes, undo, clear-page. Apple
  Pencil pressure is supported; a Draw/Scroll toggle lets you scroll without
  drawing.
- **Persistent annotations** — strokes are stored in IndexedDB per page and
  reload automatically when you reopen a lesson. Stored as normalized
  coordinates so they stay correct at any screen size.
- **Audio player** — track list per lesson with play/pause, seek, volume, mute,
  prev/next, and auto-advance.

## Asset layout

Each lesson is a folder under `public/assets/` containing **one PDF** and **any
number of MP3s**:

```
public/assets/
├─ Lesson 1 - Vowels/
│  ├─ Lesson 1 - Vowels.pdf
│  ├─ 1. Intro.mp3
│  └─ 2. Practice A.mp3
└─ Lesson 2 - Consonants/
   ├─ Lesson 2 - Consonants.pdf
   └─ 1. Warm Up.mp3
```

A build step (`scripts/generate-manifest.mjs`) scans this directory and writes
`public/assets/manifest.json`, which the app fetches at runtime. **To add or
change lessons, just edit the folders and rebuild** — no code changes needed.

> The repo ships with generated sample lessons so the app runs out of the box.
> Regenerate them anytime with `pnpm run sample-assets` (needs `ffmpeg`).

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:3000  (regenerates manifest + pdf worker first)
```

## Build & preview the static export

```bash
pnpm build          # outputs to ./out
pnpm preview        # serves ./out at http://localhost:4321
```

## Deploy to Cloudflare Pages

**Option A — Git integration (recommended).** Connect the repo in the Cloudflare
dashboard and set:

| Setting                | Value                       |
| ---------------------- | --------------------------- |
| Framework preset       | None                        |
| Build command          | `pnpm build`                |
| Build output directory | `out`                       |
| Node version           | `22` (via `.node-version`)  |

The `prebuild` step regenerates the manifest and copies the pdf.js worker on
every build, so the deploy always reflects the current `public/assets/`.

**Option B — Direct upload with Wrangler.**

```bash
pnpm run deploy     # builds, then `wrangler pages deploy` (uses wrangler.toml)
```

## Notes

- Annotations live in the browser that drew them (IndexedDB, origin-scoped).
  They are not synced across devices — by design, since there's no backend.
- The app is a single static page; there is no server runtime on Cloudflare.
