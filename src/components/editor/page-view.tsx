"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { displaySize, pageToScreen, screenToPage, type Point } from "@/lib/coords";
import { renderPageToCanvas } from "@/lib/pdf/render";
import type { InkAnnotation, PageEntry, SignatureAnnotation, TextAnnotation } from "@/lib/types";
import { newId, useEditorStore } from "@/store/editor-store";
import { useToolSettings } from "@/store/tool-settings";
import { usePdf } from "./pdf-context";
import { AnnotationLayer, strokePath } from "./annotation-layer";

const SIGNATURE_WIDTH = 160; // points

export function PageView({ page, index }: { page: PageEntry; index: number }) {
  const pdf = usePdf();
  const zoom = useEditorStore((s) => s.zoom);
  const tool = useEditorStore((s) => s.tool);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(index < 3);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { width, height } = displaySize(page, zoom);

  // Lazy render: only paint pages near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { cancel } = renderPageToCanvas(pdf, page.sourceIndex, canvas, {
      zoom,
      rotation: page.rotation,
    });
    return cancel;
  }, [pdf, page.sourceIndex, page.rotation, zoom, visible]);

  return (
    <div ref={wrapRef} className="relative shadow-lg" style={{ width, height }}>
      <canvas ref={canvasRef} className="absolute inset-0 bg-white" />
      <InteractiveLayer page={page} zoom={zoom} tool={tool} hostRef={hostRef} />
    </div>
  );
}

function InteractiveLayer({
  page,
  zoom,
  tool,
  hostRef,
}: {
  page: PageEntry;
  zoom: number;
  tool: string;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const addAnnotation = useEditorStore((s) => s.addAnnotation);
  const setTool = useEditorStore((s) => s.setTool);
  const select = useEditorStore((s) => s.select);
  const { textColor, textSize, textFont, penColor, penSize, pendingSignature, setPendingSignature } =
    useToolSettings();
  const [live, setLive] = useState<Point[] | null>(null);
  const { width, height } = displaySize(page, zoom);

  const pagePoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = hostRef.current!.getBoundingClientRect();
    return screenToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, page, zoom);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // clicked an annotation, not empty space
    const p = pagePoint(e);

    if (tool === "select") {
      select(null);
      return;
    }
    if (tool === "text") {
      const ann: TextAnnotation = {
        id: newId(),
        kind: "text",
        x: p.x,
        y: p.y,
        text: "",
        size: textSize,
        color: textColor,
        fontFamily: textFont,
        width: 220, // starting box width; drag the side handle to widen
      };
      // Switch tool first — setTool clears the selection, so add the annotation
      // afterwards or it gets deselected the instant it's created.
      setTool("select");
      addAnnotation(page.id, ann);
      return;
    }
    if (tool === "signature" && pendingSignature) {
      const w = SIGNATURE_WIDTH;
      const ann: SignatureAnnotation = {
        id: newId(),
        kind: "signature",
        x: p.x,
        y: p.y,
        dataUrl: pendingSignature.dataUrl,
        width: w,
        height: w / pendingSignature.aspect,
        aspect: pendingSignature.aspect,
      };
      // Same ordering as text: switch tool (clears selection) before adding.
      setPendingSignature(null);
      setTool("select");
      addAnnotation(page.id, ann);
      return;
    }
    if (tool === "pen") {
      (e.target as Element).setPointerCapture(e.pointerId);
      setLive([p]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool !== "pen" || !live) return;
    setLive((prev) => (prev ? [...prev, pagePoint(e)] : prev));
  };

  const onPointerUp = () => {
    if (tool !== "pen" || !live) return;
    if (live.length > 1) {
      const minX = Math.min(...live.map((p) => p.x));
      const minY = Math.min(...live.map((p) => p.y));
      const ann: InkAnnotation = {
        id: newId(),
        kind: "ink",
        x: minX,
        y: minY,
        points: live.map((p) => ({ x: p.x - minX, y: p.y - minY })),
        color: penColor,
        size: penSize,
      };
      addAnnotation(page.id, ann);
    }
    setLive(null);
  };

  const livePath = useMemo(() => {
    if (!live) return "";
    const screenPts = live.map((p) => {
      const s = pageToScreen(p, page, zoom);
      return [s.x, s.y];
    });
    return strokePath(screenPts, penSize * zoom);
  }, [live, page, zoom, penSize]);

  const cursor =
    tool === "text" ? "text" : tool === "pen" ? "crosshair" : tool === "signature" ? "copy" : "default";

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{ cursor, width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <AnnotationLayer page={page} zoom={zoom} hostRef={hostRef} />
      {live && (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
          <path d={livePath} fill={penColor} />
        </svg>
      )}
    </div>
  );
}
