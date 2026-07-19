"use client";

import { useCallback, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { useEditorStore } from "@/store/editor-store";
import { Landing } from "@/components/landing/landing";
import { PageView } from "./page-view";
import { PdfContext } from "./pdf-context";
import { ThumbnailSidebar } from "./thumbnail-sidebar";
import { Toolbar } from "./toolbar";
import { ToolOptions } from "./tool-options";

export function Editor() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const sourceBytes = useEditorStore((s) => s.sourceBytes);
  const pages = useEditorStore((s) => s.pages);
  const closeDocument = useEditorStore((s) => s.closeDocument);

  const handleOpenNew = useCallback(() => {
    closeDocument();
    setPdf(null);
  }, [closeDocument]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!pdf) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
      const store = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing && store.selection) {
        e.preventDefault();
        store.removeAnnotation(store.selection.pageId, store.selection.annotationId);
      } else if (e.key === "Escape") {
        store.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdf]);

  if (!sourceBytes || !pdf) {
    return <Landing onLoaded={setPdf} />;
  }

  return (
    <PdfContext.Provider value={pdf}>
      <div className="flex h-screen flex-col">
        <Toolbar onOpenNew={handleOpenNew} />
        <ToolOptions />
        <div className="flex min-h-0 flex-1">
          <ThumbnailSidebar />
          <main className="flex-1 overflow-auto bg-muted/60">
            <div className="flex flex-col items-center gap-6 py-8">
              {pages.map((page, i) => (
                <PageView key={page.id} page={page} index={i} />
              ))}
            </div>
          </main>
        </div>
      </div>
    </PdfContext.Provider>
  );
}
