"use client";

import { useEffect, useRef } from "react";

import { renderPageToCanvas } from "@/lib/pdf/render";
import type { PageEntry } from "@/lib/types";
import { usePdf } from "./pdf-context";

const THUMB_WIDTH = 150;

/** Small page preview used in the sidebar. Re-renders when rotation changes. */
export function Thumbnail({ page }: { page: PageEntry }) {
  const pdf = usePdf();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const swapped = page.rotation === 90 || page.rotation === 270;
    const displayW = swapped ? page.height : page.width;
    const zoom = THUMB_WIDTH / displayW;
    const { cancel } = renderPageToCanvas(pdf, page.sourceIndex, canvas, {
      zoom,
      rotation: page.rotation,
      pixelRatio: 1,
    });
    return cancel;
  }, [pdf, page.sourceIndex, page.rotation, page.width, page.height]);

  return <canvas ref={canvasRef} className="max-w-full rounded-sm bg-white shadow-sm" />;
}
