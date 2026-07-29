"use client";

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import { pageToPdf } from "@/lib/coords";
import { strokePath } from "@/lib/ink";
import { BASELINE_RATIO, LINE_HEIGHT } from "@/lib/text-metrics";
import type { Annotation, PageEntry, StandardFontKey } from "@/lib/types";

const FONT_MAP: Record<StandardFontKey, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  TimesRoman: StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full || "000000", 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

/**
 * Greedy word-wrap to `maxWidth`, breaking over-long words by character so a
 * text box saves with the same line breaks it shows on screen. An empty
 * paragraph yields one empty line so vertical spacing matches.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const fits = (s: string) => s === "" || font.widthOfTextAtSize(s, size) <= maxWidth;
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line !== "") {
      lines.push(line);
      line = "";
    }
    if (fits(word)) {
      line = word;
    } else {
      let chunk = word;
      while (!fits(chunk) && chunk.length > 1) {
        let i = 1;
        while (i < chunk.length && fits(chunk.slice(0, i + 1))) i++;
        lines.push(chunk.slice(0, i));
        chunk = chunk.slice(i);
      }
      line = chunk;
    }
  }
  lines.push(line);
  return lines;
}

/** Read an Info-dict field, tolerating a malformed one rather than failing the save. */
function read<T>(get: () => T | undefined): T | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}

/** A rebuild starts with an empty Info dict, so move the source's across field by field. */
function carryOverMetadata(src: PDFDocument, out: PDFDocument) {
  const title = read(() => src.getTitle());
  const author = read(() => src.getAuthor());
  const subject = read(() => src.getSubject());
  const keywords = read(() => src.getKeywords());
  const creator = read(() => src.getCreator());
  const producer = read(() => src.getProducer());
  const created = read(() => src.getCreationDate());
  const modified = read(() => src.getModificationDate());

  if (title !== undefined) out.setTitle(title);
  if (author !== undefined) out.setAuthor(author);
  if (subject !== undefined) out.setSubject(subject);
  // getKeywords returns the raw string; a single-element array round-trips it verbatim.
  if (keywords !== undefined) out.setKeywords([keywords]);
  if (creator !== undefined) out.setCreator(creator);
  if (producer !== undefined) out.setProducer(producer);
  if (created !== undefined) out.setCreationDate(created);
  if (modified !== undefined) out.setModificationDate(modified);
}

/**
 * Re-arrange the source document's own page tree instead of copying pages into a
 * new document. Page content is untouched, and everything that lives in the
 * document catalog — bookmarks, form fields, tagging, layers, XMP metadata —
 * survives, because the catalog is never rebuilt.
 */
function reorderInPlace(doc: PDFDocument, chosen: PageEntry[]): PDFPage[] {
  const bySourceIndex = doc.getPages();
  const target = chosen.map((entry) => bySourceIndex[entry.sourceIndex]);
  if (target.some((page) => !page)) throw new Error("Page list doesn't match the source PDF.");

  // Detaching a page leaves its objects registered in the document, so removing
  // then re-adding only rewrites the page tree's order.
  if (!chosen.every((entry, i) => entry.sourceIndex === i)) {
    for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
    for (const page of target) doc.addPage(page);
  }
  return target;
}

/**
 * Copy the kept pages into a fresh document. Only used when pages were dropped:
 * editing in place would leave a removed page's content sitting in the file, so
 * deleting and extracting have to rebuild to actually leave that data behind.
 * The kept pages are still copied verbatim — images and fonts aren't re-encoded.
 */
async function copyChosen(src: PDFDocument, chosen: PageEntry[]) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const target = await doc.copyPages(src, chosen.map((p) => p.sourceIndex));
  for (const page of target) doc.addPage(page);
  carryOverMetadata(src, doc);
  return { doc, target };
}

export interface ExportInput {
  sourceBytes: ArrayBuffer;
  pages: PageEntry[];
  annotations: Record<string, Annotation[]>;
  /** Restrict to these page ids (extract/split); defaults to all pages. */
  pageSubset?: string[];
}

/** Build the edited PDF as bytes, applying page order, rotation, and annotations. */
export async function exportPdf({
  sourceBytes,
  pages,
  annotations,
  pageSubset,
}: ExportInput): Promise<Uint8Array> {
  // updateMetadata:false keeps the source's own Info dictionary — the default
  // stamps pdf-lib as the producer and overwrites the modification date.
  const src = await PDFDocument.load(sourceBytes.slice(0), { updateMetadata: false });

  const chosen = pageSubset ? pages.filter((p) => pageSubset.includes(p.id)) : pages;
  if (chosen.length === 0) throw new Error("No pages to export.");

  // Editing the source in place preserves everything a rebuild would drop, but a
  // rebuild is the only way to discard a removed page's content — so rebuild
  // exactly when the export isn't a permutation of every source page.
  const keepsEveryPage =
    chosen.length === src.getPageCount() &&
    new Set(chosen.map((p) => p.sourceIndex)).size === chosen.length;

  const { doc, target } = keepsEveryPage
    ? { doc: src, target: reorderInPlace(src, chosen) }
    : await copyChosen(src, chosen);

  const fontCache = new Map<StandardFontKey, PDFFont>();
  const getFont = async (key: StandardFontKey) => {
    let font = fontCache.get(key);
    if (!font) {
      font = await doc.embedFont(FONT_MAP[key]);
      fontCache.set(key, font);
    }
    return font;
  };

  for (let i = 0; i < chosen.length; i++) {
    const entry = chosen[i];
    const page = target[i];
    page.setRotation(degrees(entry.rotation));

    // Draw relative to the page's own box (origin + height), not an assumed
    // (0,0)-origin page — otherwise annotations shift on cropped/offset pages.
    const box = page.getCropBox();
    const origin = { x: box.x, y: box.y };
    const pageHeight = box.height;

    const items = annotations[entry.id] ?? [];
    for (const a of items) {
      if (a.kind === "text") {
        const font = await getFont(a.fontFamily);
        const lineHeight = a.size * LINE_HEIGHT;
        // Wrap to the box width so saved line breaks match the on-screen box.
        const wrapped = a.text
          .split("\n")
          .flatMap((para) => wrapText(para, font, a.size, a.width));
        wrapped.forEach((line, li) => {
          const yTop = a.y + li * lineHeight;
          // Baseline sits BASELINE_RATIO of the font size below the line's top,
          // matching where the browser places it inside a line-height box on screen.
          const { x, y } = pageToPdf({ x: a.x, y: yTop }, pageHeight, a.size * BASELINE_RATIO, origin);
          page.drawText(line, { x, y, size: a.size, font, color: hexToRgb(a.color) });
        });
      } else if (a.kind === "signature") {
        const { bytes, mime } = dataUrlToBytes(a.dataUrl);
        // embedJpg passes the original JPEG through untouched; embedPng re-packs
        // the pixels with Flate. Either way nothing is resampled or re-compressed.
        const img = mime.includes("png")
          ? await doc.embedPng(bytes)
          : await doc.embedJpg(bytes);
        const { x, y } = pageToPdf({ x: a.x, y: a.y }, pageHeight, a.height, origin);
        page.drawImage(img, { x, y, width: a.width, height: a.height });
      } else if (a.kind === "ink") {
        // Fill the same perfect-freehand outline the editor draws rather than
        // stitching uniform-width segments, so the saved stroke keeps its taper.
        const d = strokePath(a.points.map((p) => [p.x, p.y]), a.size);
        if (d) {
          // drawSvgPath translates to (x, y) then flips the y-axis, so the path's
          // own top-left-origin coordinates line up with page space as-is.
          const { x, y } = pageToPdf({ x: a.x, y: a.y }, pageHeight, 0, origin);
          page.drawSvgPath(d, { x, y, color: hexToRgb(a.color) });
        }
      }
    }
  }

  // Field appearances are left alone: regenerating them would re-render a filled
  // form's text with pdf-lib's default font instead of the one the PDF ships.
  return doc.save({ updateFieldAppearances: false });
}

/** Trigger a browser download for exported bytes. */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
