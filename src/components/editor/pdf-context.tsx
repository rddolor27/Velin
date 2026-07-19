"use client";

import { createContext, useContext } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** The live PDF.js handle isn't serializable, so it lives in context, not the store. */
export const PdfContext = createContext<PDFDocumentProxy | null>(null);

export function usePdf(): PDFDocumentProxy {
  const pdf = useContext(PdfContext);
  if (!pdf) throw new Error("usePdf must be used within a loaded document");
  return pdf;
}
