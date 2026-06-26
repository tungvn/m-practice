"use client";

// Central pdf.js configuration. Importing this module (for its side effect)
// wires react-pdf to the self-hosted worker copied into /public by
// scripts/copy-pdf-worker.mjs. Keep all pdfjs setup here so component files
// don't each re-configure the worker.

import { pdfjs } from "react-pdf";

// The worker file is version-matched to react-pdf's bundled pdfjs-dist.
// See scripts/copy-pdf-worker.mjs and the `copy-pdf-worker` npm script.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export { pdfjs };
