#!/usr/bin/env node
/**
 * Scans public/assets/<folder>/ and writes public/assets/manifest.json.
 *
 * Each subfolder is expected to contain exactly one PDF and zero or more MP3s.
 * The manifest is consumed at runtime by the static site (no server needed).
 *
 * Run automatically via the `prebuild`/`predev` npm scripts, or directly:
 *   node scripts/generate-manifest.mjs
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_DIR = join(ROOT, "public", "assets");
const OUT_FILE = join(ASSETS_DIR, "manifest.json");

/** Turn "Lesson 1: Vowels" into "lesson-1-vowels". */
function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Natural sort so "track-2" comes before "track-10". */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function main() {
  const entries = await listDir(ASSETS_DIR);

  if (entries === null) {
    console.warn(
      `[manifest] public/assets does not exist yet — writing empty manifest.`,
    );
  }

  const folders = [];
  const seenIds = new Set();

  for (const entry of (entries ?? []).sort((a, b) =>
    naturalCompare(a.name, b.name),
  )) {
    if (!entry.isDirectory()) continue;

    const folderName = entry.name;
    const folderDir = join(ASSETS_DIR, folderName);
    const files = (await readdir(folderDir)).sort(naturalCompare);

    const pdfFile = files.find((f) => f.toLowerCase().endsWith(".pdf"));
    const mp3Files = files.filter((f) => f.toLowerCase().endsWith(".mp3"));

    if (!pdfFile) {
      console.warn(`[manifest] skipping "${folderName}" — no PDF found.`);
      continue;
    }

    let id = slugify(folderName);
    if (!id) id = "folder";
    let unique = id;
    let n = 2;
    while (seenIds.has(unique)) unique = `${id}-${n++}`;
    seenIds.add(unique);

    const base = `/assets/${encodeURIComponent(folderName)}`;
    folders.push({
      id: unique,
      name: folderName,
      pdf: {
        name: parse(pdfFile).name,
        path: `${base}/${encodeURIComponent(pdfFile)}`,
      },
      audios: mp3Files.map((f) => ({
        name: parse(f).name,
        path: `${base}/${encodeURIComponent(f)}`,
      })),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    folders,
  };

  // Ensure the assets dir exists so the write succeeds on a fresh checkout.
  await stat(ASSETS_DIR).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(ASSETS_DIR, { recursive: true });
  });

  await writeFile(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(
    `[manifest] wrote ${folders.length} folder(s) -> public/assets/manifest.json`,
  );
}

main().catch((err) => {
  console.error("[manifest] failed:", err);
  process.exit(1);
});
