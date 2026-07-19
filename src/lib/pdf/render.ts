"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import type { Rotation } from "@/lib/coords";

interface RenderOptions {
  zoom: number;
  rotation: Rotation;
  /** Extra sharpness multiplier; defaults to the device pixel ratio. */
  pixelRatio?: number;
}

/**
 * Render a source page onto `canvas` at the given zoom/rotation. Returns the
 * RenderTask so the caller can cancel an in-flight render (PDF.js throws if two
 * renders target the same canvas concurrently — cancel before re-rendering).
 */
export function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  sourceIndex: number,
  canvas: HTMLCanvasElement,
  { zoom, rotation, pixelRatio }: RenderOptions,
): { task: Promise<RenderTask | null>; cancel: () => void } {
  let task: RenderTask | null = null;
  let cancelled = false;

  const run = (async () => {
    const page = await pdf.getPage(sourceIndex + 1);
    if (cancelled) return null;

    const dpr = pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;
    const viewport = page.getViewport({ scale: zoom * dpr, rotation });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;

    task = page.render({ canvas, canvasContext: ctx, viewport });
    await task.promise;
    return task;
  })();

  // Cancelling a render (zoom change, unmount, re-render) rejects the pdf.js
  // promise. That's expected — swallow it so it doesn't surface as an unhandled
  // rejection, but let genuine render failures through.
  run.catch((err: unknown) => {
    if (cancelled || (err as Error)?.name === "RenderingCancelledException") return;
    console.error("PDF page render failed", err);
  });

  return {
    task: run,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}
