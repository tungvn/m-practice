"use client";

// IndexedDB persistence for per-page drawings. This is the "local database"
// for the app — no remote storage. Uses `idb` for a small promise wrapper.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { drawingKey, type PageDrawing } from "./types";

interface DrawingDB extends DBSchema {
  drawings: {
    key: string;
    value: PageDrawing;
    indexes: { "by-pdf": [string, string] };
  };
}

const DB_NAME = "m-practice";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DrawingDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DrawingDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<DrawingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("drawings", { keyPath: "key" });
        // Lets us load/clear every page of one PDF at once.
        store.createIndex("by-pdf", ["folderId", "pdfName"]);
      },
    });
  }
  return dbPromise;
}

/** Load the saved drawing for one page, or null if none exists yet. */
export async function loadPageDrawing(
  folderId: string,
  pdfName: string,
  pageNumber: number,
): Promise<PageDrawing | null> {
  const db = await getDB();
  const key = drawingKey(folderId, pdfName, pageNumber);
  return (await db.get("drawings", key)) ?? null;
}

/** Persist (insert or replace) the strokes for one page. */
export async function savePageDrawing(
  folderId: string,
  pdfName: string,
  pageNumber: number,
  strokes: PageDrawing["strokes"],
): Promise<void> {
  const db = await getDB();
  const record: PageDrawing = {
    key: drawingKey(folderId, pdfName, pageNumber),
    folderId,
    pdfName,
    pageNumber,
    strokes,
    updatedAt: Date.now(),
  };
  await db.put("drawings", record);
}

/** Remove all strokes for one page. */
export async function clearPageDrawing(
  folderId: string,
  pdfName: string,
  pageNumber: number,
): Promise<void> {
  const db = await getDB();
  await db.delete("drawings", drawingKey(folderId, pdfName, pageNumber));
}

/** Load every saved page of one PDF, keyed by page number. */
export async function loadPdfDrawings(
  folderId: string,
  pdfName: string,
): Promise<Map<number, PageDrawing>> {
  const db = await getDB();
  const all = await db.getAllFromIndex("drawings", "by-pdf", [
    folderId,
    pdfName,
  ]);
  return new Map(all.map((d) => [d.pageNumber, d]));
}
