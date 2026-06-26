// Shared domain types for the asset manifest and drawing persistence.

/** One audio track that belongs to a folder. */
export interface AudioFile {
  /** Display name (file name without extension). */
  name: string;
  /** Public URL path, e.g. "/assets/lesson-1/track-1.mp3". */
  path: string;
}

/** A single asset folder: exactly one PDF plus its related MP3s. */
export interface AssetFolder {
  /** URL-safe slug derived from the folder name; stable storage key. */
  id: string;
  /** Display name (the folder name on disk). */
  name: string;
  /** The folder's PDF document. */
  pdf: {
    name: string;
    path: string;
  };
  /** Zero or more audio tracks in the same folder. */
  audios: AudioFile[];
}

/** Build-time generated manifest of every asset folder. */
export interface AssetManifest {
  generatedAt: string;
  folders: AssetFolder[];
}

// ---------------------------------------------------------------------------
// Drawing model
//
// Stroke points are stored as NORMALIZED coordinates (0..1) relative to the
// rendered page box. This makes drawings resolution-independent: the same data
// renders correctly whether the PDF page is shown at iPad width, desktop width,
// or any zoom level.
// ---------------------------------------------------------------------------

export interface Point {
  /** 0..1 horizontal position within the page box. */
  x: number;
  /** 0..1 vertical position within the page box. */
  y: number;
  /** Apple Pencil pressure 0..1 (defaults to 0.5 when unavailable). */
  p?: number;
}

export type Tool = "pen" | "eraser";

export interface Stroke {
  tool: Tool;
  color: string;
  /** Base line width in CSS pixels at the current render scale. */
  size: number;
  points: Point[];
}

/** All strokes for a single PDF page, the unit stored in IndexedDB. */
export interface PageDrawing {
  /** Primary key: `${folderId}/${pdfName}/page-${pageNumber}`. */
  key: string;
  folderId: string;
  pdfName: string;
  pageNumber: number;
  strokes: Stroke[];
  updatedAt: number;
}

/** Build the canonical IndexedDB key for a page's drawing. */
export function drawingKey(
  folderId: string,
  pdfName: string,
  pageNumber: number,
): string {
  return `${folderId}/${pdfName}/page-${pageNumber}`;
}
