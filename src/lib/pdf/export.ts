"use client";

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type RGB,
} from "pdf-lib";

import { pageToPdf } from "@/lib/coords";
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
  const src = await PDFDocument.load(sourceBytes.slice(0));
  const out = await PDFDocument.create();

  const chosen = pageSubset ? pages.filter((p) => pageSubset.includes(p.id)) : pages;
  if (chosen.length === 0) throw new Error("No pages to export.");

  const copied = await out.copyPages(src, chosen.map((p) => p.sourceIndex));
  const fontCache = new Map<StandardFontKey, PDFFont>();
  const getFont = async (key: StandardFontKey) => {
    let font = fontCache.get(key);
    if (!font) {
      font = await out.embedFont(FONT_MAP[key]);
      fontCache.set(key, font);
    }
    return font;
  };

  for (let i = 0; i < chosen.length; i++) {
    const entry = chosen[i];
    const page = copied[i];
    out.addPage(page);
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
        const lines = a.text.split("\n");
        const lineHeight = a.size * 1.2;
        lines.forEach((line, li) => {
          const yTop = a.y + li * lineHeight;
          const { x, y } = pageToPdf({ x: a.x, y: yTop }, pageHeight, a.size, origin);
          page.drawText(line, { x, y, size: a.size, font, color: hexToRgb(a.color) });
        });
      } else if (a.kind === "signature") {
        const { bytes, mime } = dataUrlToBytes(a.dataUrl);
        const img = mime.includes("png")
          ? await out.embedPng(bytes)
          : await out.embedJpg(bytes);
        const { x, y } = pageToPdf({ x: a.x, y: a.y }, pageHeight, a.height, origin);
        page.drawImage(img, { x, y, width: a.width, height: a.height });
      } else if (a.kind === "ink") {
        const color = hexToRgb(a.color);
        for (let p = 1; p < a.points.length; p++) {
          const s = a.points[p - 1];
          const e = a.points[p];
          const start = pageToPdf({ x: a.x + s.x, y: a.y + s.y }, pageHeight, 0, origin);
          const end = pageToPdf({ x: a.x + e.x, y: a.y + e.y }, pageHeight, 0, origin);
          page.drawLine({
            start,
            end,
            thickness: a.size,
            color,
            lineCap: 1, // round
          });
        }
      }
    }
  }

  return out.save();
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
