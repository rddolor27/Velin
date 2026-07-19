import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { exportPdf } from "./export";
import type { Annotation, PageEntry } from "@/lib/types";

/** Build a 3-page source PDF and return its bytes as an ArrayBuffer. */
async function makeSource(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]); // page 0
  doc.addPage([300, 400]); // page 1
  doc.addPage([300, 400]); // page 2
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const entry = (id: string, sourceIndex: number, rotation: PageEntry["rotation"] = 0): PageEntry => ({
  id,
  sourceIndex,
  rotation,
  width: 300,
  height: 400,
});

describe("exportPdf", () => {
  it("keeps only retained pages, in document order", async () => {
    const source = await makeSource();
    // Drop page 1, reorder so original page 2 comes before page 0.
    const pages = [entry("c", 2), entry("a", 0)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {} });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it("applies per-page rotation", async () => {
    const source = await makeSource();
    const pages = [entry("a", 0, 0), entry("b", 1, 90)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {} });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPage(0).getRotation().angle).toBe(0);
    expect(reloaded.getPage(1).getRotation().angle).toBe(90);
  });

  it("extracts a page subset", async () => {
    const source = await makeSource();
    const pages = [entry("a", 0), entry("b", 1), entry("c", 2)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {}, pageSubset: ["b"] });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("draws text and ink annotations without error and stays a valid PDF", async () => {
    const source = await makeSource();
    const pages = [entry("a", 0)];
    const annotations: Record<string, Annotation[]> = {
      a: [
        {
          id: "t1",
          kind: "text",
          x: 20,
          y: 30,
          text: "Hello\nWorld",
          size: 14,
          color: "#112233",
          fontFamily: "Helvetica",
          width: 200,
        },
        {
          id: "i1",
          kind: "ink",
          x: 50,
          y: 60,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 15 },
            { x: 25, y: 5 },
          ],
          color: "#ff0000",
          size: 3,
        },
      ],
    };
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    expect(bytes.length).toBeGreaterThan(200);
  });

  it("throws when nothing is selected to export", async () => {
    const source = await makeSource();
    await expect(
      exportPdf({ sourceBytes: source, pages: [entry("a", 0)], annotations: {}, pageSubset: [] }),
    ).rejects.toThrow();
  });
});
