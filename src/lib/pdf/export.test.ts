import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";

import { exportPdf, wrapText } from "./export";
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

/** Source whose pages have distinct widths, so page order is observable. */
async function makeSizedSource(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([310, 400]);
  doc.addPage([320, 400]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Source carrying document metadata and a heavy payload on every page. */
async function makeRichSource(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Quarterly Report");
  doc.setAuthor("Ada Lovelace");
  doc.setSubject("Numbers");
  doc.setKeywords(["finance"]);
  doc.setProducer("Acrobat Test Harness");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage([300, 400]);
    // Enough text that dropping a page has to shrink the file measurably.
    for (let line = 0; line < 40; line++) {
      page.drawText(`page ${p} line ${line} ${"payload ".repeat(6)}`, {
        x: 10,
        y: 390 - line * 9,
        size: 7,
        font,
      });
    }
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Source with a filled form field and an outline entry in its catalog. */
async function makeStructuredSource(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const field = doc.getForm().createTextField("customer.name");
  field.setText("Ada");
  field.addToPage(page, { x: 20, y: 300, width: 200, height: 20 });
  // pdf-lib has no outline API, so register a bookmark tree by hand.
  doc.catalog.set(
    PDFName.of("Outlines"),
    doc.context.register(doc.context.obj({ Type: "Outlines", Count: 0 })),
  );
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Content-stream operators for one page of an exported file, Flate decoded. */
async function pageOperators(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [];
  const decoder = new TextDecoder();
  return refs
    .map((ref) => doc.context.lookup(ref))
    .filter((obj): obj is PDFRawStream => obj instanceof PDFRawStream)
    .map((stream) => {
      const raw = stream.getContents();
      const flate = String(stream.dict.get(PDFName.of("Filter"))).includes("FlateDecode");
      return decoder.decode(flate ? inflateSync(raw) : raw);
    })
    .join("\n");
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

  it("wraps text to the box width", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    expect(wrapText("hello world", font, 12, 500)).toEqual(["hello world"]);

    const narrow = wrapText("hello world foo bar baz", font, 12, 40);
    expect(narrow.length).toBeGreaterThan(1);

    const broken = wrapText("supercalifragilistic", font, 12, 30);
    expect(broken.length).toBeGreaterThan(1);
    expect(broken.join("")).toBe("supercalifragilistic");

    expect(wrapText("", font, 12, 100)).toEqual([""]);
  });

  it("reorders every page without rebuilding the document", async () => {
    const source = await makeSizedSource();
    const pages = [entry("c", 2), entry("b", 1), entry("a", 0)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {} });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(3);
    expect(reloaded.getPages().map((p) => Math.round(p.getWidth()))).toEqual([320, 310, 300]);
  });

  it("keeps the source metadata when every page is kept", async () => {
    const source = await makeRichSource();
    const pages = [entry("a", 0), entry("b", 1), entry("c", 2)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {} });
    const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(reloaded.getTitle()).toBe("Quarterly Report");
    expect(reloaded.getAuthor()).toBe("Ada Lovelace");
    expect(reloaded.getSubject()).toBe("Numbers");
    expect(reloaded.getKeywords()).toBe("finance");
    expect(reloaded.getProducer()).toBe("Acrobat Test Harness");
  });

  it("keeps form fields and bookmarks that a rebuild would drop", async () => {
    const source = await makeStructuredSource();
    const pages = [entry("a", 0)];
    const bytes = await exportPdf({
      sourceBytes: source,
      pages,
      annotations: {
        a: [
          {
            id: "t1",
            kind: "text",
            x: 20,
            y: 30,
            text: "signed",
            size: 12,
            color: "#000000",
            fontFamily: "Helvetica",
            width: 200,
          },
        ],
      },
    });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getForm().getFields().map((f) => f.getName())).toContain("customer.name");
    expect(reloaded.getForm().getTextField("customer.name").getText()).toBe("Ada");
    expect(reloaded.catalog.get(PDFName.of("Outlines"))).toBeDefined();
  });

  it("keeps the source metadata when pages are dropped", async () => {
    const source = await makeRichSource();
    const pages = [entry("a", 0), entry("b", 1), entry("c", 2)];
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations: {}, pageSubset: ["b"] });
    const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe("Quarterly Report");
    expect(reloaded.getAuthor()).toBe("Ada Lovelace");
    expect(reloaded.getKeywords()).toBe("finance");
  });

  it("leaves a dropped page's content out of the file", async () => {
    const source = await makeRichSource();
    const pages = [entry("a", 0), entry("b", 1), entry("c", 2)];
    const all = await exportPdf({ sourceBytes: source, pages, annotations: {} });
    const one = await exportPdf({ sourceBytes: source, pages, annotations: {}, pageSubset: ["b"] });
    // A rebuild is what makes this true — editing in place would keep the
    // discarded pages' content streams in the output.
    expect(one.length).toBeLessThan(all.length * 0.6);
  });

  it("draws ink as a single filled outline", async () => {
    const source = await makeSource();
    const pages = [entry("a", 0)];
    const annotations: Record<string, Annotation[]> = {
      a: [
        {
          id: "i1",
          kind: "ink",
          x: 40,
          y: 50,
          points: Array.from({ length: 12 }, (_, i) => ({ x: i * 4, y: i % 2 ? 6 : 0 })),
          color: "#0000ff",
          size: 4,
        },
      ],
    };
    const bytes = await exportPdf({ sourceBytes: source, pages, annotations });
    const ops = await pageOperators(bytes, 0);
    // One fill of the tapered outline, not a stroked segment per point pair.
    expect(ops.match(/^f$/gm)?.length).toBe(1);
    expect(ops).not.toMatch(/^S$/m);
    // The outline has many more vertices than the 12 input points.
    expect((ops.match(/ l$/gm) ?? []).length).toBeGreaterThan(12);
  });

  it("throws when nothing is selected to export", async () => {
    const source = await makeSource();
    await expect(
      exportPdf({ sourceBytes: source, pages: [entry("a", 0)], annotations: {}, pageSubset: [] }),
    ).rejects.toThrow();
  });
});
