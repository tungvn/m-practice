"use client";

// On-screen performance overlay for diagnosing dropped/janky strokes on a real
// device. Enable by opening the app with ?debug=1. It measures frame timing via
// requestAnimationFrame (a long frame = the main thread was blocked = dropped
// input) and reads live drawing counters from drawStats.

import { useEffect, useRef, useState } from "react";
import { drawStats, resetDrawStats } from "@/lib/drawStats";

interface Snap {
  fps: number;
  maxMs: number;
  longFrames: number;
  started: number;
  strokes: number;
  cancels: number;
  rawDowns: number;
  rawDownsOffCanvas: number;
  lastRawTarget: string;
  penDowns: number;
  touchDowns: number;
  touchWMax: number;
  touchIgnored: number;
  primaryRejected: number;
  pointerMoves: number;
  moveAvg: number;
  lastSaveMs: number;
}

const ZERO: Snap = {
  fps: 0,
  maxMs: 0,
  longFrames: 0,
  started: 0,
  strokes: 0,
  cancels: 0,
  rawDowns: 0,
  rawDownsOffCanvas: 0,
  lastRawTarget: "",
  penDowns: 0,
  touchDowns: 0,
  touchWMax: 0,
  touchIgnored: 0,
  primaryRejected: 0,
  pointerMoves: 0,
  moveAvg: 0,
  lastSaveMs: 0,
};

export default function DebugHud() {
  const acc = useRef({ last: 0, maxMs: 0, longFrames: 0, frames: 0, sumMs: 0 });
  const [snap, setSnap] = useState<Snap>(ZERO);

  useEffect(() => {
    acc.current.last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const a = acc.current;
      const dt = now - a.last;
      a.last = now;
      a.frames++;
      a.sumMs += dt;
      if (dt > a.maxMs) a.maxMs = dt;
      if (dt > 50) a.longFrames++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const id = setInterval(() => {
      const a = acc.current;
      setSnap({
        fps: a.frames > 0 ? Math.round(1000 / (a.sumMs / a.frames)) : 0,
        maxMs: Math.round(a.maxMs),
        longFrames: a.longFrames,
        started: drawStats.strokesStarted,
        strokes: drawStats.strokes,
        cancels: drawStats.cancels,
        rawDowns: drawStats.rawDowns,
        rawDownsOffCanvas: drawStats.rawDownsOffCanvas,
        lastRawTarget: drawStats.lastRawTarget,
        penDowns: drawStats.penDowns,
        touchDowns: drawStats.touchDowns,
        touchWMax: Math.round(drawStats.touchWMax),
        touchIgnored: drawStats.touchIgnored,
        primaryRejected: drawStats.primaryRejected,
        pointerMoves: drawStats.pointerMoves,
        moveAvg:
          drawStats.moveHandlerCalls > 0
            ? drawStats.moveHandlerMs / drawStats.moveHandlerCalls
            : 0,
        lastSaveMs: Math.round(drawStats.lastSaveMs),
      });
    }, 200);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const reset = () => {
    const a = acc.current;
    a.maxMs = 0;
    a.longFrames = 0;
    a.frames = 0;
    a.sumMs = 0;
    resetDrawStats();
    setSnap(ZERO);
  };

  const text =
    `FPS ~${snap.fps}   maxFrame ${snap.maxMs}ms  long ${snap.longFrames}\n` +
    `rawDn ${snap.rawDowns}  offCanvas ${snap.rawDownsOffCanvas}  [${snap.lastRawTarget}]\n` +
    `started ${snap.started}  committed ${snap.strokes}  cancels ${snap.cancels}\n` +
    `penDn ${snap.penDowns}  touchDn ${snap.touchDowns}  palmIgn ${snap.touchIgnored}\n` +
    `touchWmax ${snap.touchWMax}px  primRej ${snap.primaryRejected}\n` +
    `moves ${snap.pointerMoves}   moveHandler ${snap.moveAvg.toFixed(2)}ms\n` +
    `lastSave ${snap.lastSaveMs}ms`;

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        color: "#22ff88",
        font: "11px/1.45 ui-monospace, Menlo, monospace",
        padding: "8px 10px",
        borderRadius: 8,
        whiteSpace: "pre",
        pointerEvents: "auto",
        boxShadow: "0 2px 10px rgba(0,0,0,.4)",
      }}
    >
      {text}
      <button
        onClick={reset}
        style={{
          display: "block",
          marginTop: 6,
          color: "#000",
          background: "#22ff88",
          border: 0,
          borderRadius: 4,
          padding: "3px 8px",
          font: "11px ui-monospace, monospace",
          fontWeight: 700,
        }}
      >
        reset
      </button>
    </div>
  );
}
