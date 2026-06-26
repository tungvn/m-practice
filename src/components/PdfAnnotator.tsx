"use client";

// PdfAnnotator — PDF viewer with a per-page freehand drawing overlay and a
// single top toolbar (back, title, draw tools, view controls).
//
// Stroke model: this component owns committed strokes per page (a Map) and
// passes each page's array down to <DrawingLayer>, which renders it. A finished
// stroke is appended here, so the overlay always reflects the latest state with
// no lag. Points are normalized (0..1), so ink re-fits at any width / zoom.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import { Document, Page } from "react-pdf";
import {
  ChevronLeft,
  Pencil,
  Hand,
  Pen,
  Eraser,
  Undo2,
  Trash2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  TriangleAlert,
} from "lucide-react";

// Side-effect import: configures pdfjs.GlobalWorkerOptions.workerSrc once.
import "@/lib/pdf";

import { loadPdfDrawings, savePageDrawing, clearPageDrawing } from "@/lib/db";
import type { Stroke, Tool } from "@/lib/types";
import { drawStats } from "@/lib/drawStats";
import DrawingLayer from "./DrawingLayer";
import DebugHud from "./DebugHud";

export interface PdfAnnotatorProps {
  folderId: string;
  pdfName: string;
  pdfPath: string;
  folderName: string;
  onBack: () => void;
  audioVisible: boolean;
  onToggleAudio: () => void;
}

const READABLE_MAX_WIDTH = 820; // px cap when NOT fitting to width

const COLORS = [
  { label: "Black", value: "#1a1a1a" },
  { label: "Red", value: "#e53e3e" },
];
// "Normal" (12) is the old boldest size, which read as too thin; thinner and
// bolder options are scaled around it.
const SIZES = [
  { label: "Thin", value: 7 },
  { label: "Normal", value: 12 },
  { label: "Bold", value: 20 },
];

type PageStrokes = Map<number, Stroke[]>;

export default function PdfAnnotator({
  folderId,
  pdfName,
  pdfPath,
  folderName,
  onBack,
  audioVisible,
  onToggleAudio,
}: PdfAnnotatorProps) {
  const [numPages, setNumPages] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Perf overlay: opt-in via ?debug=1 (no overhead otherwise).
  const [debug] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"),
  );
  useEffect(() => {
    drawStats.enabled = debug;
    if (!debug) return;
    // Count EVERY pen pointerdown the browser fires, at the document level
    // (capture phase), independent of where it's routed. Comparing this to the
    // canvas handler's penDowns localizes lost strokes: if rawDowns > penDowns,
    // the browser fired the event but it never reached our canvas (routing /
    // remount); if rawDowns == penDowns but < strokes drawn, the browser itself
    // is suppressing pointerdowns (OS / gesture layer).
    const onRawDown = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      drawStats.rawDowns++;
      const t = e.target as HTMLElement | null;
      if (t?.tagName !== "CANVAS") {
        drawStats.rawDownsOffCanvas++;
        drawStats.lastRawTarget = t
          ? t.tagName.toLowerCase() +
            (t.className ? "." + String(t.className).split(" ")[0] : "")
          : "null";
      }
    };
    window.addEventListener("pointerdown", onRawDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onRawDown, { capture: true });
  }, [debug]);

  // --- Responsive page width -------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [fitWidth, setFitWidth] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = fitWidth
    ? containerWidth
    : Math.min(containerWidth, READABLE_MAX_WIDTH);

  // --- Page virtualization ---------------------------------------------------
  // A 120-page book would exhaust the iPad's per-tab memory if every page kept a
  // canvas mounted at once (the source of the "problem repeatedly occurred"
  // crash). We mount only pages near the viewport — tracked via an
  // IntersectionObserver on lightweight, correctly-sized slot divs — and unmount
  // the rest. Stroke vectors live in state, so a remounted page redraws instantly.
  const [aspectRatio, setAspectRatio] = useState(792 / 612); // h/w; refined on load
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const slotEls = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (!n) continue;
            if (e.isIntersecting) {
              if (!next.has(n)) {
                next.add(n);
                changed = true;
              }
            } else if (next.has(n)) {
              next.delete(n);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      // Small margin: render essentially only the page(s) in view. A large
      // margin would rasterize neighbor pages (each ~seconds on the main
      // thread) WHILE you're writing on the current one, freezing input and
      // dropping strokes. Smaller = a brief spinner when you scroll to a new
      // page, but no rasterization freeze while writing on a settled page.
      { root, rootMargin: "150px 0px" },
    );
    observerRef.current = obs;
    slotEls.current.forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Slot divs register here so the observer can watch them (and re-watch any
  // that mounted before the observer existed).
  const registerSlot = useCallback(
    (pageNumber: number, el: HTMLElement | null) => {
      const obs = observerRef.current;
      const prev = slotEls.current.get(pageNumber);
      if (prev && obs) obs.unobserve(prev);
      if (el) {
        slotEls.current.set(pageNumber, el);
        if (obs) obs.observe(el);
      } else {
        slotEls.current.delete(pageNumber);
      }
    },
    [],
  );

  // --- Tool state ------------------------------------------------------------
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(12);
  const [drawingEnabled, setDrawingEnabled] = useState(true);

  // --- Stroke state ----------------------------------------------------------
  // Stroke data lives in a REF, not React state. Appending a stroke must NOT
  // re-render PdfAnnotator/PageSlot/<Page> — re-rasterizing one of these heavy
  // PDF pages takes ~1s and would drop pen input. The canvas already shows the
  // stroke from live drawing; full redraws are driven by `redrawToken`, and the
  // Undo button by `undoStack`. `getStrokes` is a stable reader for redraws.
  const pageStrokesRef = useRef<PageStrokes>(new Map());
  const getStrokes = useCallback(
    (pageNumber: number) => pageStrokesRef.current.get(pageNumber) ?? EMPTY,
    [],
  );

  // Bumped only when a FULL canvas redraw is needed (undo / clear / load).
  // Plain appends don't bump it, so drawing stays off the React render path.
  const [redrawToken, setRedrawToken] = useState(0);
  const bumpRedraw = useCallback(() => setRedrawToken((t) => t + 1), []);

  // --- Debounced persistence -------------------------------------------------
  // Coalesce rapid strokes into a single IndexedDB write after a short pause
  // (the save re-serializes the whole page, so doing it per-stroke janks
  // writing). Flushed on tab-hide / unmount so nothing is lost.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyPagesRef = useRef<Set<number>>(new Set());

  const flushSaves = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const t0 = drawStats.enabled ? performance.now() : 0;
    for (const page of dirtyPagesRef.current) {
      const strokes = pageStrokesRef.current.get(page) ?? [];
      const op =
        strokes.length === 0
          ? clearPageDrawing(folderId, pdfName, page)
          : savePageDrawing(folderId, pdfName, page, strokes);
      op.catch((err) => console.error("persist failed", err));
    }
    dirtyPagesRef.current.clear();
    if (drawStats.enabled) {
      drawStats.lastSaveMs = performance.now() - t0;
      drawStats.saves++;
    }
  }, [folderId, pdfName]);

  const scheduleSave = useCallback(
    (pageNumber: number) => {
      dirtyPagesRef.current.add(pageNumber);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSaves, 600);
    },
    [flushSaves],
  );

  // Flush pending saves when the tab is hidden or the component unmounts.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushSaves();
    };
    window.addEventListener("pagehide", flushSaves);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushSaves);
      document.removeEventListener("visibilitychange", onHidden);
      flushSaves();
    };
  }, [flushSaves]);

  // Undo history lives in a REF so a normal stroke does ZERO React work.
  // `canUndo` is a flip-only boolean that updates ONLY when the stack goes
  // empty <-> non-empty, just to enable/disable the Undo button.
  const undoStackRef = useRef<number[]>([]);
  const canUndoRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const setCanUndoFlag = useCallback((v: boolean) => {
    if (canUndoRef.current !== v) {
      canUndoRef.current = v;
      setCanUndo(v);
    }
  }, []);

  // Clear menu state: which page is "this page", and the whole-book confirm.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState(1);
  const [confirmWholeBook, setConfirmWholeBook] = useState(false);

  // --- Two-finger scroll while drawing --------------------------------------
  // The canvas uses touch-action:none so the Pencil always draws; that also
  // disables native touch scrolling. We re-add a two-finger pan manually, with
  // the PEN taking priority: while a pen is down we never pan, so a resting
  // palm (one or more touch points) during writing can't scroll the page.
  const penDownRef = useRef(false);
  const panRef = useRef({ active: false, lastY: 0 });

  const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "pen") {
      penDownRef.current = true;
      panRef.current.active = false; // pen wins — cancel any pan in progress
    }
  }, []);
  const handleContainerPointerEnd = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "pen") penDownRef.current = false;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!drawingEnabled) return; // scroll mode already scrolls natively
      if (penDownRef.current) return;
      if (e.touches.length === 2) {
        panRef.current = {
          active: true,
          lastY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      } else {
        panRef.current.active = false;
      }
    },
    [drawingEnabled],
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!panRef.current.active || penDownRef.current) return;
      if (e.touches.length !== 2) {
        panRef.current.active = false;
        return;
      }
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const el = containerRef.current;
      if (el) el.scrollTop -= y - panRef.current.lastY;
      panRef.current.lastY = y;
    },
    [],
  );
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) panRef.current.active = false;
  }, []);

  // iOS Safari runs a tap/double-tap gesture recognizer on SHORT contacts and
  // withholds the pointerdown of the 2nd of two quick taps — silently eating
  // every other short pen stroke (long strokes read as drags and are immune;
  // verified: the browser fires only 5 pointerdowns for 10 short taps). React
  // registers touch listeners as passive, so onTouchStart can't cancel the
  // gesture. We attach a NATIVE non-passive touchstart and preventDefault while
  // drawing: that tells WebKit we're handling the touch, so it skips the tap
  // recognizer. Pointer events still fire (they're not touchstart's default
  // action), and two-finger pan still works via the manual touchmove handler.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStartNative = (e: TouchEvent) => {
      if (drawingEnabled) e.preventDefault();
    };
    el.addEventListener("touchstart", onTouchStartNative, { passive: false });
    return () => el.removeEventListener("touchstart", onTouchStartNative);
  }, [drawingEnabled]);

  // Load saved drawings once the PDF page count is known.
  useEffect(() => {
    if (numPages === 0) return;
    let cancelled = false;
    loadPdfDrawings(folderId, pdfName).then((saved) => {
      if (cancelled) return;
      const initial: PageStrokes = new Map();
      saved.forEach((d, pageNumber) => initial.set(pageNumber, d.strokes));
      pageStrokesRef.current = initial;
      undoStackRef.current = [];
      setCanUndoFlag(false);
      bumpRedraw(); // paint the loaded strokes onto mounted canvases
    });
    return () => {
      cancelled = true;
    };
  }, [folderId, pdfName, numPages, setCanUndoFlag, bumpRedraw]);

  const handleStrokeComplete = useCallback(
    (pageNumber: number, stroke: Stroke) => {
      // Mutate the ref in place — NO React state update, NO redraw bump. The
      // stroke is already on the canvas from live drawing. A stroke therefore
      // triggers zero re-renders (after the first, which flips canUndo on).
      const arr = pageStrokesRef.current.get(pageNumber);
      if (arr) arr.push(stroke);
      else pageStrokesRef.current.set(pageNumber, [stroke]);
      undoStackRef.current.push(pageNumber);
      setCanUndoFlag(true);
      scheduleSave(pageNumber);
    },
    [setCanUndoFlag, scheduleSave],
  );

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const pageNumber = stack.pop()!;
    const existing = pageStrokesRef.current.get(pageNumber) ?? [];
    pageStrokesRef.current.set(pageNumber, existing.slice(0, -1));
    setCanUndoFlag(stack.length > 0);
    bumpRedraw(); // removing a stroke needs a full redraw
    scheduleSave(pageNumber);
  }, [setCanUndoFlag, bumpRedraw, scheduleSave]);

  // Which page is "this page" for the Clear menu — the one most centered in
  // the scroll viewport right now.
  const getCurrentPage = useCallback(() => {
    const container = containerRef.current;
    if (!container) return 1;
    const c = container.getBoundingClientRect();
    const mid = c.top + c.height / 2;
    let best = 1;
    let bestDist = Infinity;
    for (const [page, el] of slotEls.current) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= c.top || r.top >= c.bottom) continue; // off-screen
      const dist = Math.abs(r.top + r.height / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = page;
      }
    }
    return best;
  }, []);

  const openClearMenu = useCallback(() => {
    setClearTarget(getCurrentPage());
    setConfirmWholeBook(false);
    setConfirmClearOpen(true);
  }, [getCurrentPage]);

  const handleClearPage = useCallback(
    (pageNumber: number) => {
      pageStrokesRef.current.set(pageNumber, []);
      undoStackRef.current = undoStackRef.current.filter((n) => n !== pageNumber);
      setCanUndoFlag(undoStackRef.current.length > 0);
      bumpRedraw();
      dirtyPagesRef.current.add(pageNumber);
      flushSaves(); // clearing is deliberate — persist immediately
      setConfirmClearOpen(false);
    },
    [setCanUndoFlag, bumpRedraw, flushSaves],
  );

  const handleClearBook = useCallback(() => {
    const pages = [...pageStrokesRef.current.keys()];
    pageStrokesRef.current = new Map();
    undoStackRef.current = [];
    setCanUndoFlag(false);
    bumpRedraw();
    for (const p of pages) dirtyPagesRef.current.add(p);
    flushSaves(); // each now-empty page is deleted from IndexedDB
    setConfirmClearOpen(false);
    setConfirmWholeBook(false);
  }, [setCanUndoFlag, bumpRedraw, flushSaves]);

  // Close the confirm modal on Escape.
  useEffect(() => {
    if (!confirmClearOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmClearOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClearOpen]);

  const handleDocumentLoadSuccess = useCallback(
    async (pdf: {
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (o: { scale: number }) => { width: number; height: number };
      }>;
    }) => {
      setNumPages(pdf.numPages);
      setPdfError(null);
      // Derive the page aspect ratio up front so slot heights are correct
      // before any page renders (these books are uniformly sized).
      try {
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        if (vp.width > 0) setAspectRatio(vp.height / vp.width);
      } catch {
        /* keep default ratio */
      }
    },
    [],
  );
  const handleDocumentLoadError = useCallback(
    (error: Error) => setPdfError(error.message),
    [],
  );

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  );

  return (
    <div className="flex h-full flex-col bg-zinc-100">
      {/* Single top toolbar */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-1.5 border-b border-zinc-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
        <button
          onClick={onBack}
          className="flex h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          aria-label="Back to library"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="mr-1 max-w-[14ch] truncate text-sm font-semibold text-zinc-900 sm:max-w-[24ch]">
          {folderName}
        </span>

        <Divider />

        {/* Draw / Scroll toggle */}
        <button
          onClick={() => setDrawingEnabled((v) => !v)}
          className={`flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold transition-colors ${
            drawingEnabled
              ? "bg-indigo-600 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
          title={drawingEnabled ? "Drawing on — tap to scroll" : "Scrolling — tap to draw"}
        >
          {drawingEnabled ? <Pencil className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
          <span className="hidden sm:inline">{drawingEnabled ? "Draw" : "Scroll"}</span>
        </button>

        {/* Pen / Eraser */}
        <ToolBtn
          active={tool === "pen" && drawingEnabled}
          onClick={() => {
            setTool("pen");
            setDrawingEnabled(true);
          }}
          label="Pen"
        >
          <Pen className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn
          active={tool === "eraser" && drawingEnabled}
          onClick={() => {
            setTool("eraser");
            setDrawingEnabled(true);
          }}
          label="Eraser"
        >
          <Eraser className="h-4 w-4" />
        </ToolBtn>

        <Divider />

        {/* Colors */}
        {COLORS.map((c) => {
          const selected = color === c.value && tool === "pen" && drawingEnabled;
          return (
            <button
              key={c.value}
              onClick={() => {
                setColor(c.value);
                setTool("pen");
                setDrawingEnabled(true);
              }}
              title={c.label}
              aria-label={c.label}
              className="flex h-9 w-9 items-center justify-center"
            >
              <span
                className="block h-6 w-6 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: c.value,
                  borderColor: selected ? "#6366f1" : "transparent",
                  transform: selected ? "scale(1.18)" : "scale(1)",
                }}
              />
            </button>
          );
        })}

        <Divider />

        {/* Sizes */}
        {SIZES.map((s) => {
          const selected = size === s.value && tool === "pen" && drawingEnabled;
          return (
            <button
              key={s.value}
              onClick={() => {
                setSize(s.value);
                setTool("pen");
                setDrawingEnabled(true);
              }}
              title={s.label}
              aria-label={`${s.label} pen`}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                selected ? "bg-zinc-200" : "hover:bg-zinc-100"
              }`}
            >
              <span
                className="block rounded-full bg-zinc-800"
                style={{ width: s.value + 4, height: s.value + 4 }}
              />
            </button>
          );
        })}

        <Divider />

        <ToolBtn active={false} onClick={handleUndo} label="Undo" disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolBtn>
        <button
          onClick={openClearMenu}
          title="Clear drawings"
          className="flex h-9 items-center gap-1 rounded-lg bg-red-50 px-2.5 text-sm font-medium text-red-600 hover:bg-red-100"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Clear</span>
        </button>

        {/* Right-aligned view controls */}
        <div className="ml-auto flex items-center gap-1.5">
          <ToolBtn
            active={fitWidth}
            onClick={() => setFitWidth((v) => !v)}
            label={fitWidth ? "Readable width" : "Fit to width"}
          >
            {fitWidth ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolBtn>
          <ToolBtn
            active={audioVisible}
            onClick={onToggleAudio}
            label={audioVisible ? "Hide audio" : "Show audio"}
          >
            {audioVisible ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </ToolBtn>
        </div>
      </div>

      {/* Scrollable PDF viewport */}
      <div
        ref={containerRef}
        className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-2 py-4"
        style={{ touchAction: drawingEnabled ? "none" : "auto" }}
        onPointerDown={handleContainerPointerDown}
        onPointerUp={handleContainerPointerEnd}
        onPointerCancel={handleContainerPointerEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {pdfError ? (
          <div className="mt-20 flex flex-col items-center gap-2 text-red-600">
            <p className="text-lg font-semibold">Failed to load PDF</p>
            <p className="max-w-xs text-center text-sm text-red-500">{pdfError}</p>
          </div>
        ) : null}

        <Document
          file={pdfPath}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={
            <div className="mt-20 flex flex-col items-center gap-3 text-zinc-500">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-300 border-t-indigo-500" />
              <span className="text-sm">Loading PDF…</span>
            </div>
          }
          error={null}
        >
          {pageNumbers.map((pageNumber) => (
            <PageSlot
              key={pageNumber}
              pageNumber={pageNumber}
              pageWidth={pageWidth}
              pageHeight={Math.round(pageWidth * aspectRatio)}
              active={visiblePages.has(pageNumber)}
              registerSlot={registerSlot}
              getStrokes={getStrokes}
              redrawToken={redrawToken}
              tool={tool}
              color={color}
              size={size}
              drawingEnabled={drawingEnabled}
              onStrokeComplete={handleStrokeComplete}
            />
          ))}
        </Document>
      </div>

      {debug && <DebugHud />}

      {/* Clear menu modal */}
      {confirmClearOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-dialog-title"
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-red-600" />
              <h2 id="clear-dialog-title" className="text-base font-semibold text-zinc-900">
                {confirmWholeBook ? "Clear the whole book?" : "Clear drawings"}
              </h2>
            </div>

            {confirmWholeBook ? (
              <>
                <p className="mb-5 mt-2 text-sm text-zinc-500">
                  This erases your drawings on{" "}
                  <span className="font-medium text-zinc-700">every page</span> of
                  this book. It can&apos;t be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmWholeBook(false)}
                    className="h-10 rounded-lg px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleClearBook}
                    className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Erase whole book
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 mt-1 text-sm text-zinc-500">
                  Choose what to erase. This can&apos;t be undone.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleClearPage(clearTarget)}
                    className="flex h-11 items-center justify-between rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    <span>Clear this page</span>
                    <span className="text-zinc-400">Page {clearTarget}</span>
                  </button>
                  <button
                    onClick={() => setConfirmWholeBook(true)}
                    className="flex h-11 items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 hover:bg-red-100"
                  >
                    <span>Clear whole book</span>
                    <span className="text-red-400">All pages</span>
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setConfirmClearOpen(false)}
                    className="h-10 rounded-lg px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY: Stroke[] = [];

// PDF render resolution. 1.5x balances crispness against rasterization cost
// (2x froze the main thread ~3.4s on these heavy pages).
const DPR =
  typeof window !== "undefined"
    ? Math.min(1.5, window.devicePixelRatio || 1)
    : 1;

function Divider() {
  return <div className="mx-0.5 h-6 w-px bg-zinc-200" />;
}

function ToolBtn({
  active,
  onClick,
  label,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
        active ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

// Isolated, memoized PDF page. Its props are only `pageNumber`, `pageWidth`,
// and a stable `onRendered`, so React.memo lets it re-rasterize ONLY on a real
// width/page change — not on every stroke/tool/redraw update of its parent.
const PdfPage = memo(function PdfPage({
  pageNumber,
  pageWidth,
  onRendered,
}: {
  pageNumber: number;
  pageWidth: number;
  onRendered: () => void;
}) {
  return (
    <Page
      pageNumber={pageNumber}
      width={pageWidth}
      devicePixelRatio={DPR}
      renderAnnotationLayer={false}
      renderTextLayer={false}
      loading={null}
      onRenderSuccess={onRendered}
    />
  );
});

// ---------------------------------------------------------------------------
// One virtualized PDF page slot.
//
// The outer div always exists at the correct size (so scroll height is stable
// and the IntersectionObserver can track it). The heavy <Page> + <DrawingLayer>
// mount only when `active` (near the viewport) and unmount otherwise to free
// canvas memory.
// ---------------------------------------------------------------------------
interface PageSlotProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  active: boolean;
  registerSlot: (pageNumber: number, el: HTMLElement | null) => void;
  getStrokes: (pageNumber: number) => Stroke[];
  redrawToken: number;
  tool: Tool;
  color: string;
  size: number;
  drawingEnabled: boolean;
  onStrokeComplete: (pageNumber: number, stroke: Stroke) => void;
}

const PageSlot = memo(function PageSlot({
  pageNumber,
  pageWidth,
  pageHeight,
  active,
  registerSlot,
  getStrokes,
  redrawToken,
  tool,
  color,
  size,
  drawingEnabled,
  onStrokeComplete,
}: PageSlotProps) {
  const slotRef = useCallback(
    (el: HTMLDivElement | null) => registerSlot(pageNumber, el),
    [pageNumber, registerSlot],
  );

  // These textbook PDFs are heavy (10–15 MB) and take a moment to rasterize,
  // so show a spinner until the page paints rather than a confusing blank.
  // Reset `rendered` when the page re-mounts/re-renders, using React's
  // adjust-state-during-render pattern (no effect needed).
  const [rendered, setRendered] = useState(false);
  const handleRendered = useCallback(() => setRendered(true), []);
  const renderKey = `${active}|${pageWidth}`;
  const [prevRenderKey, setPrevRenderKey] = useState(renderKey);
  if (renderKey !== prevRenderKey) {
    setPrevRenderKey(renderKey);
    setRendered(false);
  }

  return (
    <div
      ref={slotRef}
      data-page={pageNumber}
      className="relative overflow-hidden rounded-sm bg-white shadow-md"
      style={{ width: pageWidth, height: pageHeight }}
    >
      {active ? (
        <>
          {!rendered && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-indigo-500" />
            </div>
          )}
          {/* Memoized so it re-rasterizes ONLY on width/page change — never
              when strokes / tool / redrawToken change (re-rasterizing a heavy
              page takes ~1s and would drop pen input). */}
          <PdfPage
            pageNumber={pageNumber}
            pageWidth={pageWidth}
            onRendered={handleRendered}
          />
          <DrawingLayer
            pageNumber={pageNumber}
            cssWidth={pageWidth}
            cssHeight={pageHeight}
            getStrokes={getStrokes}
            redrawToken={redrawToken}
            tool={tool}
            color={color}
            size={size}
            drawingEnabled={drawingEnabled}
            onStrokeComplete={onStrokeComplete}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-300">
          <span className="text-sm">Page {pageNumber}</span>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-3 select-none rounded bg-black/30 px-1.5 py-0.5 text-xs text-white">
        {pageNumber}
      </div>
    </div>
  );
});
