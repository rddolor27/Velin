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
 * Browsers cap canvas area — Safari is the tightest at roughly 16.7M device
 * pixels, past which the canvas silently paints blank. Above the cap sharpness
 * is traded away so the page still appears.
 */
const MAX_CANVAS_PIXELS = 16_000_000;

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

    const requested =
      pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;
    // CSS-pixel size of the displayed page box — what the layout already reserves.
    const css = page.getViewport({ scale: zoom, rotation });
    const cssArea = css.width * css.height;
    const dpr =
      cssArea * requested * requested > MAX_CANVAS_PIXELS
        ? Math.sqrt(MAX_CANVAS_PIXELS / cssArea)
        : requested;

    const viewport = page.getViewport({ scale: zoom * dpr, rotation });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");

    // Round the backing store to whole device pixels and pin the CSS box to the
    // page's exact layout size. Flooring the backing store while deriving the CSS
    // box from the unfloored viewport leaves the box wider than the pixels behind
    // it, so the browser upscales the canvas and softens every page.
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    canvas.style.width = `${css.width}px`;
    canvas.style.height = `${css.height}px`;

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
