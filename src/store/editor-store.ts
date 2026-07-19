"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";

import { normalizeRotation, type Rotation } from "@/lib/coords";
import type { Annotation, PageEntry, Tool } from "@/lib/types";

const HISTORY_LIMIT = 50;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

interface Selection {
  pageId: string;
  annotationId: string;
}

/** The slice of state that undo/redo restores. */
interface DocSnapshot {
  pages: PageEntry[];
  annotations: Record<string, Annotation[]>;
}

interface EditorState extends DocSnapshot {
  sourceBytes: ArrayBuffer | null;
  fileName: string | null;
  tool: Tool;
  zoom: number;
  selection: Selection | null;
  /** Multi-selected page ids for bulk delete / extract (not undo-tracked). */
  pageSelection: string[];
  past: DocSnapshot[];
  future: DocSnapshot[];

  // lifecycle
  loadDocument: (doc: { sourceBytes: ArrayBuffer; fileName: string; pages: PageEntry[] }) => void;
  closeDocument: () => void;

  // view
  setTool: (tool: Tool) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // selection
  select: (sel: Selection | null) => void;
  togglePageSelection: (pageId: string) => void;
  clearPageSelection: () => void;

  // history
  beginHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // page ops
  removePage: (pageId: string) => void;
  reorderPages: (fromId: string, toId: string) => void;
  rotatePage: (pageId: string, delta: number) => void;

  // annotation ops
  addAnnotation: (pageId: string, annotation: Annotation) => void;
  updateAnnotation: (pageId: string, annotationId: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (pageId: string, annotationId: string) => void;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function snapshotOf(state: DocSnapshot): DocSnapshot {
  // Structural clone is enough — arrays/objects are plain data.
  return {
    pages: state.pages.map((p) => ({ ...p })),
    annotations: Object.fromEntries(
      Object.entries(state.annotations).map(([k, list]) => [k, list.map((a) => ({ ...a }))]),
    ),
  };
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Push the current doc onto the undo stack and clear redo. */
  const pushHistory = () => {
    const { pages, annotations, past } = get();
    const next = [...past, snapshotOf({ pages, annotations })];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ past: next, future: [] });
  };

  return {
    sourceBytes: null,
    fileName: null,
    pages: [],
    annotations: {},
    tool: "select",
    zoom: 1,
    selection: null,
    pageSelection: [],
    past: [],
    future: [],

    loadDocument: ({ sourceBytes, fileName, pages }) =>
      set({
        sourceBytes,
        fileName,
        pages,
        annotations: {},
        tool: "select",
        zoom: 1,
        selection: null,
        pageSelection: [],
        past: [],
        future: [],
      }),

    closeDocument: () =>
      set({
        sourceBytes: null,
        fileName: null,
        pages: [],
        annotations: {},
        selection: null,
        pageSelection: [],
        past: [],
        future: [],
      }),

    setTool: (tool) => set({ tool, selection: null }),
    setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
    zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom + ZOOM_STEP) })),
    zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom - ZOOM_STEP) })),

    select: (selection) => set({ selection }),

    togglePageSelection: (pageId) =>
      set((s) => ({
        pageSelection: s.pageSelection.includes(pageId)
          ? s.pageSelection.filter((id) => id !== pageId)
          : [...s.pageSelection, pageId],
      })),

    clearPageSelection: () => set({ pageSelection: [] }),

    beginHistory: () => pushHistory(),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return s;
        return {
          past: s.past.slice(0, -1),
          future: [...s.future, snapshotOf({ pages: s.pages, annotations: s.annotations })],
          pages: prev.pages,
          annotations: prev.annotations,
          selection: null,
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[s.future.length - 1];
        if (!next) return s;
        return {
          future: s.future.slice(0, -1),
          past: [...s.past, snapshotOf({ pages: s.pages, annotations: s.annotations })],
          pages: next.pages,
          annotations: next.annotations,
          selection: null,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    removePage: (pageId) => {
      pushHistory();
      set((s) => {
        const { [pageId]: _removed, ...rest } = s.annotations;
        return {
          pages: s.pages.filter((p) => p.id !== pageId),
          annotations: rest,
          selection: s.selection?.pageId === pageId ? null : s.selection,
          pageSelection: s.pageSelection.filter((id) => id !== pageId),
        };
      });
    },

    reorderPages: (fromId, toId) => {
      if (fromId === toId) return;
      pushHistory();
      set((s) => {
        const pages = [...s.pages];
        const from = pages.findIndex((p) => p.id === fromId);
        const to = pages.findIndex((p) => p.id === toId);
        if (from === -1 || to === -1) return s;
        const [moved] = pages.splice(from, 1);
        pages.splice(to, 0, moved);
        return { pages };
      });
    },

    rotatePage: (pageId, delta) => {
      pushHistory();
      set((s) => ({
        pages: s.pages.map((p) =>
          p.id === pageId
            ? { ...p, rotation: normalizeRotation(p.rotation + delta) as Rotation }
            : p,
        ),
      }));
    },

    addAnnotation: (pageId, annotation) => {
      pushHistory();
      set((s) => ({
        annotations: {
          ...s.annotations,
          [pageId]: [...(s.annotations[pageId] ?? []), annotation],
        },
        selection: { pageId, annotationId: annotation.id },
      }));
    },

    updateAnnotation: (pageId, annotationId, patch) =>
      set((s) => {
        const list = s.annotations[pageId];
        if (!list) return s;
        return {
          annotations: {
            ...s.annotations,
            [pageId]: list.map((a) =>
              a.id === annotationId ? ({ ...a, ...patch } as Annotation) : a,
            ),
          },
        };
      }),

    removeAnnotation: (pageId, annotationId) => {
      pushHistory();
      set((s) => {
        const list = s.annotations[pageId];
        if (!list) return s;
        return {
          annotations: { ...s.annotations, [pageId]: list.filter((a) => a.id !== annotationId) },
          selection:
            s.selection?.annotationId === annotationId ? null : s.selection,
        };
      });
    },
  };
});

/** Convenience factory so components/pdf code share id generation. */
export const newId = () => nanoid(10);
