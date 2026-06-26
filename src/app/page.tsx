"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Music2 } from "lucide-react";
import { useManifest } from "@/lib/manifest";
import type { AssetFolder } from "@/lib/types";
import AudioPlayer from "@/components/AudioPlayer";

// react-pdf pulls in browser-only modules (pdf.js, DOMMatrix). Load it on the
// client only so it never runs during the static-export prerender step.
const PdfAnnotator = dynamic(() => import("@/components/PdfAnnotator"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-zinc-400">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-300 border-t-indigo-500" />
    </div>
  ),
});

export default function Home() {
  const { status, manifest, error } = useManifest();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (status === "loading") {
    return <CenteredMessage spinner>Loading library…</CenteredMessage>;
  }

  if (status === "error") {
    return (
      <CenteredMessage tone="error">
        Couldn&apos;t load the asset manifest.
        <span className="mt-1 block text-sm opacity-70">{error}</span>
      </CenteredMessage>
    );
  }

  const folders = manifest.folders;
  const selected = folders.find((f) => f.id === selectedId) ?? null;

  if (selected) {
    return <LessonView folder={selected} onBack={() => setSelectedId(null)} />;
  }

  return <FolderGrid folders={folders} onPick={setSelectedId} />;
}

// ---------------------------------------------------------------------------
// Home: grid of asset folders
// ---------------------------------------------------------------------------
function FolderGrid({
  folders,
  onPick,
}: {
  folders: AssetFolder[];
  onPick: (id: string) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Practice</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a lesson to read its PDF, annotate with your pencil, and play the
          audio.
        </p>
      </header>

      {folders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center text-zinc-500">
          <p className="font-medium">No lessons found.</p>
          <p className="mt-1 text-sm">
            Add folders under{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
              public/assets/
            </code>{" "}
            (each with one PDF + MP3s), then rebuild.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                onClick={() => onPick(folder.id)}
                className="group flex h-full w-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:translate-y-0"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FileText className="h-6 w-6" />
                </div>
                <h2 className="line-clamp-2 font-semibold text-zinc-900 group-hover:text-indigo-700">
                  {folder.name}
                </h2>
                <p className="mt-1 truncate text-xs text-zinc-400">
                  {folder.pdf.name}.pdf
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                  <Music2 className="h-3.5 w-3.5" />
                  {folder.audios.length}{" "}
                  {folder.audios.length === 1 ? "track" : "tracks"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Lesson view: single-topbar PDF annotator + toggleable audio sidebar
// ---------------------------------------------------------------------------
function LessonView({
  folder,
  onBack,
}: {
  folder: AssetFolder;
  onBack: () => void;
}) {
  const [audioVisible, setAudioVisible] = useState(true);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* PDF pane owns the single topbar (back, title, tools, view toggles) */}
        <section className="min-h-0 flex-1 overflow-hidden">
          <PdfAnnotator
            folderId={folder.id}
            pdfName={folder.pdf.name}
            pdfPath={folder.pdf.path}
            folderName={folder.name}
            onBack={onBack}
            audioVisible={audioVisible}
            onToggleAudio={() => setAudioVisible((v) => !v)}
          />
        </section>

        {/* Audio pane: toggleable. Fixed-height strip on small screens, sidebar on md+. */}
        {audioVisible && (
          <aside className="flex h-64 shrink-0 flex-col border-t border-zinc-200 bg-white md:h-auto md:w-64 md:border-l md:border-t-0 lg:w-72 xl:w-80">
            <div className="shrink-0 border-b border-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Audio
            </div>
            <div className="min-h-0 flex-1">
              <AudioPlayer audios={folder.audios} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared message component
// ---------------------------------------------------------------------------
function CenteredMessage({
  children,
  spinner = false,
  tone = "normal",
}: {
  children: React.ReactNode;
  spinner?: boolean;
  tone?: "normal" | "error";
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {spinner && (
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-300 border-t-indigo-500" />
      )}
      <div className={tone === "error" ? "font-medium text-red-600" : "text-zinc-600"}>
        {children}
      </div>
    </main>
  );
}
