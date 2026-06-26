#!/usr/bin/env node
/**
 * Copies the pdf.js worker out of node_modules into public/ so it is
 * self-hosted and version-matched with react-pdf's bundled pdfjs-dist.
 *
 * The app sets `pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"`,
 * which resolves to this copied file. Self-hosting (vs a CDN) keeps the app
 * working offline and avoids API/Worker version-mismatch errors.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const DEST_DIR = join(ROOT, "public");
const DEST = join(DEST_DIR, "pdf.worker.min.mjs");

async function main() {
  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("[pdf-worker] copied pdf.worker.min.mjs -> public/");
}

main().catch((err) => {
  console.error("[pdf-worker] failed:", err);
  process.exit(1);
});
