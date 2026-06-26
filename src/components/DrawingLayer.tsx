"use client";

// DrawingLayer: a transparent <canvas> overlaying one PDF page. It owns no
// stroke state — the parent passes the committed `strokes` and the canvas is
// the deterministic projection of that array (redrawn whenever it changes or
// the page resizes). A stroke in progress is drawn live on top; when it
// commits, the parent appends it to `strokes`, which re-renders the full set.
// This "redraw from props" model is what keeps strokes in lock-step (no lag).

import { useRef, useEffect, useCallback } from "react";
import type { Stroke, Point, Tool } from "@/lib/types";
import { drawStats } from "@/lib/drawStats";

// Canvas backing-store scale for the ink overlay (crisp strokes).
const MAX_DPR = 2;
function getDpr(): number {
  return Math.min(MAX_DPR, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
}

// Palm rejection by CONTACT SIZE rather than pointer type. The iPad sometimes
// reports the Apple Pencil as pointerType "touch", so type-based rejection
// drops real strokes. A Pencil/finger contact is small; a palm is large, so we
// reject only non-pen contacts whose size (px) exceeds this threshold.
const PALM_MIN_CONTACT = 30;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Stroke width in device pixels for a given point's pressure. */
function widthFor(stroke: Stroke, p: Point, dpr: number): number {
  return Math.max(0.75, stroke.size * (p.p ?? 0.5) * dpr);
}

/** Draw a whole stroke with midpoint-quadratic smoothing and per-point width. */
function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  W: number,
  H: number,
  dpr: number,
) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  const erase = stroke.tool === "eraser";
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  const paint = erase ? "rgba(0,0,0,1)" : stroke.color;
  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;

  const px = (p: Point): [number, number] => [p.x * W, p.y * H];

  // A single tap renders as a dot.
  if (pts.length === 1) {
    const [x, y] = px(pts[0]);
    ctx.beginPath();
    ctx.arc(x, y, widthFor(stroke, pts[0], dpr) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = px(pts[i - 1]);
    const [x1, y1] = px(pts[i]);
    ctx.beginPath();
    ctx.lineWidth = widthFor(stroke, pts[i], dpr);
    if (i === 1) {
      ctx.moveTo(x0, y0);
    } else {
      const [xp, yp] = px(pts[i - 2]);
      ctx.moveTo((xp + x0) / 2, (yp + y0) / 2);
    }
    // Curve through the previous point, landing on the segment midpoint.
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DrawingLayerProps {
  pageNumber: number;
  /** CSS pixel width of the page box. */
  cssWidth: number;
  /** CSS pixel height of the page box. */
  cssHeight: number;
  /** Reads the current committed strokes for this page (used only for full
      redraws). A stable getter, NOT a changing prop — so stroke appends don't
      re-render this component or re-run the redraw effect. */
  getStrokes: (pageNumber: number) => Stroke[];
  /** Bumped by the parent to force a full redraw (undo / clear / load).
      A plain stroke append does NOT bump it — the live ink already painted
      the stroke, so we skip the expensive clear+redraw and avoid wiping a
      fast follow-up stroke mid-draw. */
  redrawToken: number;
  tool: Tool;
  color: string;
  size: number;
  drawingEnabled: boolean;
  /** Fired on pointer-up with the finished stroke; parent appends + saves. */
  onStrokeComplete: (pageNumber: number, stroke: Stroke) => void;
}

export default function DrawingLayer({
  pageNumber,
  cssWidth,
  cssHeight,
  getStrokes,
  redrawToken,
  tool,
  color,
  size,
  drawingEnabled,
  onStrokeComplete,
}: DrawingLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live stroke state (refs so handlers never see stale values).
  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Full redraw — ONLY on resize or an explicit `redrawToken` bump (undo /
  // clear / load), never on a plain append. Normal strokes are painted live and
  // left on the canvas, so drawing isn't coupled to React's render cycle.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth === 0 || cssHeight === 0) return;
    const dpr = getDpr();
    const w = Math.round(cssWidth * dpr);
    const h = Math.round(cssHeight * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of getStrokes(pageNumber))
      renderStroke(ctx, s, canvas.width, canvas.height, dpr);
  }, [redrawToken, cssWidth, cssHeight, getStrokes, pageNumber]);

  // -------------------------------------------------------------------------
  // Pointer input
  // -------------------------------------------------------------------------

  const toNormalized = useCallback((e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      p: e.pressure > 0 ? e.pressure : 0.5,
    };
  }, []);

  /** Draw the most recent segment of the live stroke on top of committed ink. */
  const drawLiveSegment = useCallback(() => {
    const canvas = canvasRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !stroke) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = getDpr();
    const pts = stroke.points;
    const px = (p: Point): [number, number] => [
      p.x * canvas.width,
      p.y * canvas.height,
    ];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const erase = stroke.tool === "eraser";
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = erase ? "rgba(0,0,0,1)" : stroke.color;
    ctx.fillStyle = erase ? "rgba(0,0,0,1)" : stroke.color;

    if (pts.length === 1) {
      const [x, y] = px(pts[0]);
      ctx.beginPath();
      ctx.arc(x, y, widthFor(stroke, pts[0], dpr) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const n = pts.length;
      const [x0, y0] = px(pts[n - 2]);
      const [x1, y1] = px(pts[n - 1]);
      ctx.beginPath();
      ctx.lineWidth = widthFor(stroke, pts[n - 1], dpr);
      if (n === 2) {
        ctx.moveTo(x0, y0);
      } else {
        const [xp, yp] = px(pts[n - 3]);
        ctx.moveTo((xp + x0) / 2, (yp + y0) / 2);
      }
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingEnabled) return;
      const contact = Math.max(e.width || 0, e.height || 0);
      if (drawStats.enabled) {
        if (e.pointerType === "pen") drawStats.penDowns++;
        if (e.pointerType === "touch") {
          drawStats.touchDowns++;
          drawStats.touchWLast = contact;
          if (contact > drawStats.touchWMax) drawStats.touchWMax = contact;
        }
      }
      // Reject palm by SIZE, not type — the Pencil can arrive as "touch". A pen
      // is always accepted; a non-pen contact is rejected only if it's large
      // (palm). Small touches (Pencil mis-typed, or a fingertip) draw.
      if (e.pointerType !== "pen" && contact >= PALM_MIN_CONTACT) {
        if (drawStats.enabled) drawStats.touchIgnored++;
        return;
      }
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* non-fatal */
      }
      activePointerIdRef.current = e.pointerId;
      activeStrokeRef.current = { tool, color, size, points: [toNormalized(e)] };
      drawLiveSegment();
      if (drawStats.enabled) drawStats.strokesStarted++;
    },
    [drawingEnabled, tool, color, size, toNormalized, drawLiveSegment],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!activeStrokeRef.current) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      const t0 = drawStats.enabled ? performance.now() : 0;
      activeStrokeRef.current.points.push(toNormalized(e));
      drawLiveSegment();
      if (drawStats.enabled) {
        drawStats.pointerMoves++;
        drawStats.pointsCaptured++;
        drawStats.moveHandlerMs += performance.now() - t0;
        drawStats.moveHandlerCalls++;
      }
    },
    [toNormalized, drawLiveSegment],
  );

  const finalizeStroke = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!activeStrokeRef.current) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      const stroke = activeStrokeRef.current;
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      if (drawStats.enabled) {
        drawStats.strokes++;
        drawStats.lastStrokePoints = stroke.points.length;
      }
      onStrokeComplete(pageNumber, stroke);
    },
    [pageNumber, onStrokeComplete],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (drawStats.enabled && activePointerIdRef.current === e.pointerId)
        drawStats.cancels++;
      finalizeStroke(e); // commit whatever was drawn before the cancel
    },
    [finalizeStroke],
  );

  const cursor = !drawingEnabled
    ? "default"
    : tool === "eraser"
      ? "cell"
      : "crosshair";

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        width: cssWidth,
        height: cssHeight,
        pointerEvents: drawingEnabled ? "auto" : "none",
        touchAction: "none",
        cursor,
        userSelect: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finalizeStroke}
      onPointerCancel={handlePointerCancel}
    />
  );
}
