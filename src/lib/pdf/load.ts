"use client";

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { normalizeRotation } from "@/lib/coords";
import type { PageEntry } from "@/lib/types";
import { newId } from "@/store/editor-store";

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured) return;
  // Served from /public; version matches the installed pdfjs-dist (see plan).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  workerConfigured = true;
}

export interface LoadedPdf {
  pdf: PDFDocumentProxy;
  pages: PageEntry[];
}

/**
 * Parse a PDF into a render handle plus the initial page model.
 * `bytes` is copied first so the caller's pristine buffer is never detached.
 */
export async function loadPdf(bytes: ArrayBuffer): Promise<LoadedPdf> {
  ensureWorker();
  const data = bytes.slice(0);
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages: PageEntry[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    pages.push({
      id: newId(),
      sourceIndex: i - 1,
      rotation: normalizeRotation(page.rotate),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return { pdf, pages };
}

export type { PDFDocumentProxy };
