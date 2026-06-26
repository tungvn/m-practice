# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Next.js note: this project uses Next.js 16 (App Router). APIs may differ from
> older versions — see `@AGENTS.md` and `node_modules/next/dist/docs/` when unsure.

## What this is

A 100% client-side, static-exported Next.js app: a lesson library where each
lesson is a PDF you can read and annotate (Apple Pencil), plus its MP3 tracks.
**No backend, no auth, no remote DB.** Annotations persist in IndexedDB.
Deploy target is Cloudflare Pages (static `out/` directory).

## Commands

```bash
pnpm dev            # dev server (runs predev: manifest + pdf worker copy)
pnpm build          # static export to ./out (runs prebuild: manifest + worker)
pnpm preview        # serve ./out locally on :4321
pnpm lint           # eslint
pnpm run manifest   # regenerate public/assets/manifest.json from public/assets/
pnpm run sample-assets   # (re)generate demo PDFs+MP3s — needs ffmpeg
pnpm run deploy     # build + wrangler pages deploy
```

There is no test suite. Verify changes by building and exercising the app in a
browser (`pnpm preview`), especially drawing + reload persistence.

## Architecture (the parts that span files)

**Static-export constraint.** `next.config.ts` sets `output: "export"`, so there
is no server at runtime. Consequences that shape the code:

- All data is loaded client-side. The home page fetches
  `/assets/manifest.json` via `useManifest()` (`src/lib/manifest.ts`).
- `react-pdf` pulls in browser-only modules, so `PdfAnnotator` is imported with
  `next/dynamic({ ssr: false })` in `src/app/page.tsx`. **Do not import
  `react-pdf` (or anything that touches it) into a module that runs during the
  prerender** or the build breaks.

**Asset pipeline (build-time).** Two scripts run in `prebuild`/`predev`:

- `scripts/generate-manifest.mjs` — scans `public/assets/<folder>/` (one PDF +
  N MP3s each) and writes `public/assets/manifest.json`. Adding a lesson = add a
  folder + rebuild; no code change. Both `manifest.json` and the worker are
  gitignored (regenerated each build).
- `scripts/copy-pdf-worker.mjs` — copies pdf.js's worker into
  `public/pdf.worker.min.mjs`. `src/lib/pdf.ts` points
  `pdfjs.GlobalWorkerOptions.workerSrc` at it. **The worker version must match
  react-pdf's bundled `pdfjs-dist`** (currently pinned to 5.4.296 in
  package.json); a mismatch causes silent render failures.

**Drawing model (the non-obvious core).** `src/lib/types.ts` defines strokes
with **normalized coordinates** (x,y in 0..1 relative to the page box) so
annotations survive any screen size / DPR. The flow:

- `PdfAnnotator` (`src/components/PdfAnnotator.tsx`) owns per-page stroke state,
  the single top toolbar (back/title/tools/view toggles live in one bar), and
  all IndexedDB I/O.
- Each PDF page renders a `<Page>` with a `DrawingLayer.tsx` `<canvas>` overlay
  (`z-index: 10`, `touch-action: none`) on top. **Text/annotation layers are
  intentionally disabled** (`renderTextLayer={false}`) — react-pdf's text layer
  otherwise sits above the canvas and steals pointer events.
- Input is via Pointer Events (pen pressure, palm rejection). `DrawingLayer` is
  a **pure projection of its `strokes` prop**: a finished stroke is appended in
  `PdfAnnotator`, which re-renders the page, and an effect redraws the committed
  strokes deterministically. (Don't reintroduce imperative redraw refs — the
  old version lagged one stroke behind.)
- Persistence is in `src/lib/db.ts` (the `idb` wrapper). Key is
  `${folderId}/${pdfName}/page-${n}`. Strokes save on pointer-up and reload via
  `loadPdfDrawings` when a PDF opens.

**Page virtualization (do not remove).** Books are 100+ pages; rendering every
page's canvas at once exhausts the iPad's per-tab memory and crashes WebKit.
`PdfAnnotator` mounts the `<Page>`+`<DrawingLayer>` only for pages near the
viewport (an `IntersectionObserver` on always-present, correctly-sized slot
divs) and unmounts the rest; canvas DPR is capped at 2. Slot height comes from
the PDF aspect ratio (read once in `onLoadSuccess`) so scroll height is stable
without rendering. Stroke vectors stay in state, so a remounted page redraws
instantly.

**Layout.** `src/app/page.tsx` is a single page that swaps between the folder
grid and a lesson view (state, not routing). The lesson view is PDF + audio
side-by-side on `md+`, stacked on small screens.

@AGENTS.md
