// Lightweight, mutable stats shared between the drawing layer (which increments
// them) and the on-screen DebugHud (which displays them). Enabled only when the
// page is opened with ?debug=1, so there's zero overhead in normal use.

export interface DrawStats {
  enabled: boolean;
  rawDowns: number; // every pen pointerdown the browser delivered (window capture)
  rawDownsOffCanvas: number; // pen downs whose target was NOT the drawing canvas
  lastRawTarget: string; // tag of the last off-canvas pen-down target
  penDowns: number; // pen pointerdowns seen
  touchDowns: number; // raw touch pointerdowns seen (any, before rejection)
  touchWLast: number; // contact size (px) of the last touch down
  touchWMax: number; // largest touch contact size seen
  strokesStarted: number; // pointerdowns that began a stroke
  strokes: number; // strokes committed (pointerup/cancel)
  cancels: number; // pointercancel events (browser aborted a stroke)
  primaryRejected: number; // non-pen downs dropped for !isPrimary
  touchIgnored: number; // touch downs ignored (palm rejection)
  pointerMoves: number;
  pointsCaptured: number;
  lastStrokePoints: number;
  moveHandlerMs: number; // cumulative time spent in the move handler
  moveHandlerCalls: number;
  lastSaveMs: number; // synchronous cost of the last IndexedDB flush
  saves: number;
}

export const drawStats: DrawStats = {
  enabled: false,
  rawDowns: 0,
  rawDownsOffCanvas: 0,
  lastRawTarget: "",
  penDowns: 0,
  touchDowns: 0,
  touchWLast: 0,
  touchWMax: 0,
  strokesStarted: 0,
  strokes: 0,
  cancels: 0,
  primaryRejected: 0,
  touchIgnored: 0,
  pointerMoves: 0,
  pointsCaptured: 0,
  lastStrokePoints: 0,
  moveHandlerMs: 0,
  moveHandlerCalls: 0,
  lastSaveMs: 0,
  saves: 0,
};

export function resetDrawStats() {
  drawStats.rawDowns = 0;
  drawStats.rawDownsOffCanvas = 0;
  drawStats.lastRawTarget = "";
  drawStats.penDowns = 0;
  drawStats.touchDowns = 0;
  drawStats.touchWLast = 0;
  drawStats.touchWMax = 0;
  drawStats.strokesStarted = 0;
  drawStats.strokes = 0;
  drawStats.cancels = 0;
  drawStats.primaryRejected = 0;
  drawStats.touchIgnored = 0;
  drawStats.pointerMoves = 0;
  drawStats.pointsCaptured = 0;
  drawStats.lastStrokePoints = 0;
  drawStats.moveHandlerMs = 0;
  drawStats.moveHandlerCalls = 0;
  drawStats.lastSaveMs = 0;
  drawStats.saves = 0;
}
