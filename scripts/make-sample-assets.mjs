#!/usr/bin/env node
/**
 * DEV HELPER (not part of the build): generates a couple of sample asset
 * folders under public/assets so the app can be run locally without real
 * content. Each folder gets one multi-page PDF and a few short MP3 tones.
 *
 * Requires ffmpeg on PATH for the MP3s. Run once:
 *   node scripts/make-sample-assets.mjs
 *
 * Real usage: drop your own <folder>/<file>.pdf + <file>.mp3 into
 * public/assets and run `pnpm run manifest`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS = join(ROOT, "public", "assets");

/** Build a minimal valid multi-page PDF with a big page number on each page. */
function buildPdf(title, pageCount) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (s) => {
    const bytes = enc.encode(s);
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObj = (n) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  push("%PDF-1.4\n");

  // Object numbering: 1 catalog, 2 pages, then per page a Page + Contents obj,
  // and a final shared Font object.
  const pageObjs = [];
  const contentObjs = [];
  let next = 3;
  for (let i = 0; i < pageCount; i++) {
    pageObjs.push(next++);
    contentObjs.push(next++);
  }
  const fontObj = next++;

  // 1: Catalog
  startObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  startObj(2);
  push(
    `<< /Type /Pages /Kids [${pageObjs
      .map((o) => `${o} 0 R`)
      .join(" ")}] /Count ${pageCount} >>\nendobj\n`,
  );

  for (let i = 0; i < pageCount; i++) {
    // Page object
    startObj(pageObjs[i]);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R >> >> ` +
        `/Contents ${contentObjs[i]} 0 R >>\nendobj\n`,
    );
    // Content stream
    const text =
      `BT /F1 40 Tf 60 720 Td (${title}) Tj ET\n` +
      `BT /F1 120 Tf 200 360 Td (${i + 1} / ${pageCount}) Tj ET`;
    startObj(contentObjs[i]);
    push(`<< /Length ${enc.encode(text).length} >>\nstream\n${text}\nendstream\nendobj\n`);
  }

  // Font
  startObj(fontObj);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  // xref
  const totalObjs = fontObj; // objects are 1..fontObj
  const xrefOffset = length;
  push(`xref\n0 ${totalObjs + 1}\n`);
  push("0000000000 65535 f \n");
  for (let n = 1; n <= totalObjs; n++) {
    push(String(offsets[n]).padStart(10, "0") + " 00000 n \n");
  }
  push(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function makeMp3(path, freq, seconds) {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${freq}:duration=${seconds}`,
    "-q:a",
    "9",
    path,
  ]);
}

async function makeFolder(name, pages, tones) {
  const dir = join(ASSETS, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.pdf`), buildPdf(name, pages));
  let i = 1;
  for (const [label, freq, secs] of tones) {
    await makeMp3(join(dir, `${i}. ${label}.mp3`), freq, secs);
    i++;
  }
  console.log(`[sample] ${name}: ${pages}-page pdf + ${tones.length} mp3(s)`);
}

await mkdir(ASSETS, { recursive: true });
await makeFolder("Lesson 1 - Vowels", 3, [
  ["Intro", 440, 3],
  ["Practice A", 523, 4],
  ["Practice E", 587, 4],
]);
await makeFolder("Lesson 2 - Consonants", 4, [
  ["Warm Up", 392, 3],
  ["Drill B", 494, 5],
]);
console.log("[sample] done. Run `pnpm run manifest` next.");
