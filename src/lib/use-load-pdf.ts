"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { loadPdf } from "@/lib/pdf/load";
import { useEditorStore } from "@/store/editor-store";

/** Shared "open a PDF file" logic used by the landing page and the editor. */
export function useLoadPdf(onLoaded: (pdf: PDFDocumentProxy) => void) {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const [busy, setBusy] = useState(false);

  const loadFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("That doesn't look like a PDF.");
        return;
      }
      setBusy(true);
      try {
        const bytes = await file.arrayBuffer();
        const { pdf, pages } = await loadPdf(bytes);
        loadDocument({ sourceBytes: bytes, fileName: file.name, pages });
        onLoaded(pdf);
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        toast.error(
          /password|encrypt/i.test(message)
            ? "This PDF is password-protected and can't be opened."
            : "Couldn't read that PDF.",
        );
      } finally {
        setBusy(false);
      }
    },
    [loadDocument, onLoaded],
  );

  return { loadFile, busy };
}
