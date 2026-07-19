# Plan: Client-Side PDF Editor (Next.js)

A browser-based PDF editor supporting page removal, image/drawn signatures, text input, and freehand writing. All processing happens client-side — files never leave the user's machine.

## Core principle

All PDF processing happens in the browser. Next.js serves the static UI; there are no API routes touching PDF data. This is both a privacy feature and a simplification (no upload limits, no server costs).

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | All editor components are `"use client"`; running locally (`pnpm dev`) for now, deployment decided later. Package manager: **pnpm**. Desktop-only — no mobile/touch effort in v1 |
| UI components | shadcn/ui | Toolbar, dialogs, dropdowns, sliders, tooltips — accessible, themeable, copy-in components |
| Theming | Tailwind CSS + `next-themes` | Light + dark mode with a toggle; shadcn CSS variables handle both. PDF canvas stays white either way |
| PDF rendering (preview) | `pdfjs-dist` (PDF.js) | Renders pages to `<canvas>` for the visual editor |
| PDF manipulation (save) | `pdf-lib` | Pure-JS, client-side: remove pages, embed images, draw text/paths |
| Signature drawing | `react-signature-canvas` (or plain canvas) | Draw-to-sign; export as PNG data URL |
| Overlay drag/resize | `react-rnd` or `react-moveable` | Position text boxes and signatures on pages |
| State | Zustand | Document model + undo/redo without prop drilling. In-memory only — a refresh clears the session (saved signatures persist in `localStorage`) |

Note the two-library split: **PDF.js reads and displays**, **pdf-lib edits and writes**. This is the standard pattern — neither library does both jobs well.

### shadcn/ui component mapping

| UI element | shadcn component |
|---|---|
| Toolbar actions (tools, zoom, undo/redo) | `Button`, `Toggle`, `ToggleGroup`, `Tooltip` |
| Signature modal (draw / upload tabs) | `Dialog`, `Tabs` |
| Text formatting (font, size, color) | `Select`, `Slider`, `Popover`, `DropdownMenu` |
| Pen options (color, stroke width) | `Popover`, `Slider` |
| Page thumbnail actions (delete, rotate, extract) | `ContextMenu`, `Checkbox` (multi-select) |
| Delete/discard confirmations | `AlertDialog` |
| Errors & save feedback (e.g. encrypted PDF) | `Sonner` (toasts) |
| Sidebar / panels | `ScrollArea`, `Separator` |
| Theme toggle | `DropdownMenu` (light / dark / system via `next-themes`) |

### Design direction

Desktop-only editor with a classic three-region layout: a slim top toolbar (file actions left, tool group center, zoom/undo/theme right), a left thumbnail sidebar (~180px, collapsible), and a centered document canvas on a muted background (`bg-muted`) so pages read as white "paper" with a soft shadow in both themes. Stock shadcn look — neutral palette, default radius, `Inter` via `next/font` — with a single primary accent used for the active tool, selection handles, and focus rings. Selected annotations get a 1px accent outline with corner handles; tool state is always visible in the toolbar. Keep chrome quiet so the document is the visual focus.

## Architecture

```
Loaded PDF (ArrayBuffer)
   ├─ pdf.js  → renders each page to canvas (the "paper")
   └─ kept in memory as the pristine source
Annotation layer (React state, per page)
   ├─ text boxes   { page, x, y, text, font, size, color }
   ├─ signatures   { page, x, y, w, h, pngDataUrl }
   └─ ink strokes  { page, points[], color, width }
Page operations: ordered list of { sourceIndex, rotation } (remove/reorder/rotate)
On "Save": pdf-lib re-opens the pristine buffer → copies retained pages
           → draws text/images/SVG paths at converted coordinates → download Blob
```

Keeping edits as an annotation model (rather than mutating the PDF live) gives cheap undo/redo and only one lossy "flatten" step at export.

## Phases

### Phase 1 — Scaffold & viewer

1. `pnpm create next-app` with TypeScript + Tailwind; run `shadcn init` and set up `next-themes` with a light/dark toggle. Configure the PDF.js worker (copy `pdf.worker.min.mjs` to `/public` or use the bundler-friendly `import`; must be dynamic/client-only — PDF.js breaks under SSR).
2. File open: drag-and-drop + file picker → `ArrayBuffer` in a Zustand store.
3. Page viewer: virtualized vertical scroll of canvases, thumbnail sidebar, zoom controls. Render at `devicePixelRatio` for crisp text.

### Phase 2 — Page operations

4. Thumbnail sidebar with per-page delete and multi-select. Model the document as an ordered list of `{ sourceIndex, rotation }` entries; the viewer renders from it. Instant, fully reversible.
5. **Reorder**: drag-and-drop thumbnails (e.g. `dnd-kit`) — just reorders the list.
6. **Rotate**: per-page 90° rotation from the thumbnail context menu; PDF.js viewport handles preview rotation, and export applies it via pdf-lib's `setRotation`. Annotation coordinate conversion must account for it.
7. **Extract/split**: "Export selected pages" action that runs the same pdf-lib export pipeline on only the selected pages.

### Phase 3 — Text input

8. "Add text" tool: click a page → editable text box overlay (absolutely positioned div over the canvas). Font size, family (limit to pdf-lib's standard 14 fonts, or embed a TTF via `@pdf-lib/fontkit` for Unicode), color. Drag to reposition.

### Phase 4 — Signatures

9. Signature modal with two tabs: **draw** (signature canvas → PNG with transparent background) and **upload image** (accept PNG/JPG). Store reusable signatures in `localStorage`.
10. Placed signature = image overlay on the page, draggable and resizable with aspect lock.

### Phase 5 — Freehand writing (pen tool)

11. Pointer-event capture on a transparent canvas over each page; smooth strokes (e.g. `perfect-freehand`), color/width options, per-stroke erase.

### Phase 6 — Export

12. Save with pdf-lib: `copyPages` for retained pages in their current order, `setRotation` per page, `drawText`, `drawImage` (embed PNG/JPG), `drawSvgPath` or `drawLine` segments for ink. **Critical detail:** coordinate conversion — screen coords are top-left origin in CSS pixels at current zoom; PDF coords are bottom-left origin in points, and pages can have rotation. Centralize this in one tested utility.
13. Download via `Blob` + anchor click (optionally File System Access API on Chromium for "Save as").

### Phase 7 — Polish

14. Undo/redo (command stack over the document + annotation model), keyboard shortcuts, delete-key on selected overlay.
15. Guardrails: encrypted-PDF detection with a friendly error, large-file handling (lazy page rendering).

## Implementation notes

### Project structure

```
src/
├─ app/                    # layout.tsx (ThemeProvider, fonts), page.tsx (dynamic-imports Editor, ssr: false)
├─ components/
│  ├─ ui/                  # shadcn components (generated)
│  ├─ editor/              # Editor.tsx (layout shell), Toolbar.tsx, ThumbnailSidebar.tsx,
│  │                       # PageView.tsx (canvas + overlays), AnnotationLayer.tsx, InkCanvas.tsx
│  └─ dialogs/             # SignatureDialog.tsx, ExtractPagesDialog.tsx
├─ store/
│  └─ editor-store.ts      # Zustand store (document, pages, annotations, tool, selection, history)
└─ lib/
   ├─ pdf/                 # load.ts (pdf.js init + worker), render.ts (page → canvas), export.ts (pdf-lib save)
   ├─ coords.ts            # screen ↔ PDF-point conversion (zoom, origin flip, rotation) — unit tested
   └─ signatures.ts        # localStorage persistence for saved signatures
```

### Store shape (Zustand)

```ts
{
  sourceBytes: ArrayBuffer | null        // pristine original, never mutated
  pdfDoc: PDFDocumentProxy | null        // pdf.js handle for rendering
  pages: { id, sourceIndex, rotation }[] // order = document order; remove/reorder/rotate edit this
  annotations: Record<pageId, Annotation[]>  // discriminated union: text | signature | ink
  tool: 'select' | 'text' | 'signature' | 'pen'
  selection: annotationId | null
  zoom: number
  history: { past: Patch[], future: Patch[] }  // undo/redo as inverse patches over pages+annotations
}
```

Keying annotations by stable `pageId` (not index) means removal/reorder never orphans or misassigns annotations.

### Key mechanics

- **Rendering**: `PageView` gets a stable render task per page; cancel in-flight `renderTask` on zoom change/unmount (PDF.js throws on concurrent renders to one canvas). Only render pages near the viewport (simple `IntersectionObserver` virtualization).
- **Overlays**: each page is a `position: relative` wrapper at CSS size = viewport size; annotations live in an absolutely-positioned sibling div above the canvas. Annotation coords are stored in **PDF points relative to the unrotated page**, converted to CSS pixels at render — so zoom and rotation never mutate stored data.
- **Coordinate conversion** (`coords.ts`): pure functions `pdfToScreen(pt, page, zoom)` / `screenToPdf(px, page, zoom)` handling the y-flip, zoom scale, and 0/90/180/270 rotation. Written first, with Vitest cases for all four rotations — everything else trusts it.
- **Undo/redo**: every mutation goes through an `apply(patch)` helper that pushes the inverse patch to `history.past` and clears `future`. Covers page ops and annotation ops uniformly.
- **Export** (`export.ts`): `PDFDocument.load(sourceBytes)` → `copyPages` in `pages[]` order → per page: `setRotation`, then draw that page's annotations (text via embedded font, signatures via `embedPng`/`embedJpg`, ink via `drawSvgPath` built from stroke points) → `save()` → Blob download. Extract/split reuses the same function with a page subset.
- **Ink capture**: one transparent canvas per page, active only when tool = pen; strokes recorded as point arrays in PDF coords, rendered with `perfect-freehand` for preview and converted to SVG path data at export.

## Known pitfalls to plan around

- **SSR**: every PDF component needs `"use client"` and dynamic import with `ssr: false`; PDF.js references `window`/workers at import time.
- **Worker version mismatch**: PDF.js API and worker versions must match exactly — pin the version and load the worker from your own bundle, not a CDN.
- **Coordinate math** is where these apps break: origin flip, zoom scale, page rotation, and pages of differing sizes. Write unit tests for the converter before wiring export.
- **Scanned PDFs**: text "editing" here is overlay-only (adding text), not reflowing existing text — true content editing of existing PDF text is out of scope for pdf-lib and worth stating in the UI.

## Build order

v1 is the **full feature set**: pages, text, signatures, and pen tool all working through the export pipeline before calling it done. The phases still build in the order above — viewer first, then each annotation type — since they all flow through the same overlay/export pipeline, but nothing ships until Phase 7 polish is in.
