"use client";

import { useEffect, useRef, useState } from "react";
import getStroke from "perfect-freehand";

import { pageToScreen, screenToPage, type Point } from "@/lib/coords";
import { LINE_HEIGHT } from "@/lib/text-metrics";
import { cn } from "@/lib/utils";
import type {
  Annotation,
  InkAnnotation,
  PageEntry,
  SignatureAnnotation,
  TextAnnotation,
} from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";

/** Stable reference so the selector doesn't return a fresh [] each render. */
const NO_ANNOTATIONS: Annotation[] = [];

const FONT_CSS: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  TimesRoman: "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

/** Pointer position in page space (top-left, points), correct for any rotation. */
function pointerToPage(e: { clientX: number; clientY: number }, host: HTMLElement, page: PageEntry, zoom: number): Point {
  const rect = host.getBoundingClientRect();
  return screenToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, page, zoom);
}

export function AnnotationLayer({
  page,
  zoom,
  hostRef,
}: {
  page: PageEntry;
  zoom: number;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const annotations = useEditorStore((s) => s.annotations[page.id] ?? NO_ANNOTATIONS);
  const selection = useEditorStore((s) => s.selection);

  return (
    <>
      {annotations.map((a) => {
        const selected = selection?.annotationId === a.id;
        if (a.kind === "text")
          return <TextItem key={a.id} page={page} zoom={zoom} ann={a} selected={selected} hostRef={hostRef} />;
        if (a.kind === "signature")
          return <SignatureItem key={a.id} page={page} zoom={zoom} ann={a} selected={selected} hostRef={hostRef} />;
        return <InkItem key={a.id} page={page} zoom={zoom} ann={a} selected={selected} hostRef={hostRef} />;
      })}
    </>
  );
}

/** Shared move behaviour: convert absolute pointer to page space each move. */
function useDrag(
  page: PageEntry,
  zoom: number,
  hostRef: React.RefObject<HTMLDivElement | null>,
  ann: Annotation,
) {
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const beginHistory = useEditorStore((s) => s.beginHistory);
  const select = useEditorStore((s) => s.select);

  return (e: React.PointerEvent) => {
    e.stopPropagation();
    const host = hostRef.current;
    if (!host) return;
    select({ pageId: page.id, annotationId: ann.id });
    const startPage = pointerToPage(e, host, page, zoom);
    const grab = { x: startPage.x - ann.x, y: startPage.y - ann.y };
    let moved = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!moved) {
        beginHistory();
        moved = true;
      }
      const p = pointerToPage(ev, host, page, zoom);
      updateAnnotation(page.id, ann.id, { x: p.x - grab.x, y: p.y - grab.y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}

/** Rotation transform so an annotation's local axes follow the page's axes. */
function itemStyle(ann: { x: number; y: number }, page: PageEntry, zoom: number): React.CSSProperties {
  const anchor = pageToScreen({ x: ann.x, y: ann.y }, page, zoom);
  return {
    position: "absolute",
    left: anchor.x,
    top: anchor.y,
    transform: `rotate(${page.rotation}deg)`,
    transformOrigin: "0 0",
  };
}

function TextItem({
  page,
  zoom,
  ann,
  selected,
  hostRef,
}: {
  page: PageEntry;
  zoom: number;
  ann: TextAnnotation;
  selected: boolean;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const removeAnnotation = useEditorStore((s) => s.removeAnnotation);
  const beginHistory = useEditorStore((s) => s.beginHistory);
  const onDrag = useDrag(page, zoom, hostRef, ann);
  const [editing, setEditing] = useState(ann.text === "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    // Defer focus to the next task so it lands AFTER the creating click's own
    // focus handling. Focusing synchronously lets the browser then move focus to
    // <body>, which blurs the still-empty box and triggers the cleanup below —
    // that's what made a new text box vanish/"deselect" the instant it appeared.
    const id = window.setTimeout(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [editing]);

  const lineHeight = ann.size * LINE_HEIGHT * zoom;

  // Drag the corner to scale the whole text box — width and font size together,
  // so the block grows uniformly (like resizing an image).
  const onResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const host = hostRef.current;
    if (!host) return;
    const startWidth = ann.width;
    const startSize = ann.size;
    let started = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!started) {
        beginHistory();
        started = true;
      }
      const p = pointerToPage(ev, host, page, zoom);
      const width = Math.max(24, p.x - ann.x);
      const size = Math.min(200, Math.max(6, (startSize * width) / startWidth));
      updateAnnotation(page.id, ann.id, { width, size });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      style={{ ...itemStyle(ann, page, zoom), width: ann.width * zoom }}
      className={cn("group", selected && "outline outline-1 outline-brand")}
      onPointerDown={editing ? undefined : onDrag}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={taRef}
          value={ann.text}
          onChange={(e) => updateAnnotation(page.id, ann.id, { text: e.target.value })}
          onBlur={() => {
            setEditing(false);
            // Read the live value from the store, not this render's closure, so a
            // box you actually typed into is never mistaken for empty.
            const latest = useEditorStore
              .getState()
              .annotations[page.id]?.find((a) => a.id === ann.id);
            if (latest?.kind === "text" && latest.text.trim() === "") {
              removeAnnotation(page.id, ann.id);
            }
          }}
          onFocus={() => beginHistory()}
          style={{
            fontSize: ann.size * zoom,
            lineHeight: `${lineHeight}px`,
            color: ann.color,
            fontFamily: FONT_CSS[ann.fontFamily],
          }}
          className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
          rows={Math.max(1, ann.text.split("\n").length)}
        />
      ) : (
        <div
          style={{
            fontSize: ann.size * zoom,
            lineHeight: `${lineHeight}px`,
            color: ann.color,
            fontFamily: FONT_CSS[ann.fontFamily],
          }}
          className="cursor-move whitespace-pre-wrap break-words"
        >
          {ann.text}
        </div>
      )}
      {selected && !editing && (
        <span
          onPointerDown={onResize}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-background bg-brand"
        />
      )}
    </div>
  );
}

function SignatureItem({
  page,
  zoom,
  ann,
  selected,
  hostRef,
}: {
  page: PageEntry;
  zoom: number;
  ann: SignatureAnnotation;
  selected: boolean;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const onDrag = useDrag(page, zoom, hostRef, ann);
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const beginHistory = useEditorStore((s) => s.beginHistory);

  const onResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const host = hostRef.current;
    if (!host) return;
    let started = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!started) {
        beginHistory();
        started = true;
      }
      const p = pointerToPage(ev, host, page, zoom);
      const width = Math.max(24, p.x - ann.x);
      updateAnnotation(page.id, ann.id, { width, height: width / ann.aspect });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      style={{ ...itemStyle(ann, page, zoom), width: ann.width * zoom, height: ann.height * zoom }}
      className={cn("cursor-move", selected && "outline outline-1 outline-brand")}
      onPointerDown={onDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ann.dataUrl} alt="Signature" className="pointer-events-none h-full w-full object-contain" draggable={false} />
      {selected && (
        <span
          onPointerDown={onResize}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-background bg-brand"
        />
      )}
    </div>
  );
}

function InkItem({
  page,
  zoom,
  ann,
  selected,
  hostRef,
}: {
  page: PageEntry;
  zoom: number;
  ann: InkAnnotation;
  selected: boolean;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const onDrag = useDrag(page, zoom, hostRef, ann);
  const xs = ann.points.map((p) => p.x);
  const ys = ann.points.map((p) => p.y);
  const w = (Math.max(...xs, 0) + ann.size) * zoom;
  const h = (Math.max(...ys, 0) + ann.size) * zoom;
  const d = strokePath(ann.points.map((p) => [p.x * zoom, p.y * zoom]), ann.size * zoom);

  return (
    <div
      style={{ ...itemStyle(ann, page, zoom), width: w, height: h }}
      className={cn("cursor-move", selected && "outline outline-1 outline-brand")}
      onPointerDown={onDrag}
    >
      <svg width={w} height={h} className="pointer-events-none overflow-visible">
        <path d={d} fill={ann.color} />
      </svg>
    </div>
  );
}

/** perfect-freehand outline -> SVG path data. */
export function strokePath(points: number[][], size: number): string {
  const outline = getStroke(points, { size: Math.max(1, size), thinning: 0.6, streamline: 0.5 });
  if (outline.length === 0) return "";
  return (
    outline.reduce((acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`), "") + " Z"
  );
}
