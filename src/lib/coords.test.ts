import { describe, expect, it } from "vitest";
import {
  displaySize,
  normalizeRotation,
  pageToPdf,
  pageToScreen,
  screenToPage,
  type PageGeometry,
  type Rotation,
} from "./coords";

const W = 100;
const H = 200;

const geom = (rotation: Rotation): PageGeometry => ({ width: W, height: H, rotation });

describe("normalizeRotation", () => {
  it("snaps and wraps to the four canonical angles", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-270)).toBe(90);
  });
});

describe("displaySize", () => {
  it("keeps orientation at 0/180 and swaps at 90/270", () => {
    expect(displaySize(geom(0), 1)).toEqual({ width: 100, height: 200 });
    expect(displaySize(geom(180), 1)).toEqual({ width: 100, height: 200 });
    expect(displaySize(geom(90), 1)).toEqual({ width: 200, height: 100 });
    expect(displaySize(geom(270), 1)).toEqual({ width: 200, height: 100 });
  });

  it("scales by zoom", () => {
    expect(displaySize(geom(0), 2)).toEqual({ width: 200, height: 400 });
  });
});

describe("pageToScreen corners at zoom 1", () => {
  const topLeft = { x: 0, y: 0 };
  const topRight = { x: W, y: 0 };
  const bottomLeft = { x: 0, y: H };

  it("rotation 0 is identity", () => {
    expect(pageToScreen(topLeft, geom(0), 1)).toEqual({ x: 0, y: 0 });
    expect(pageToScreen(topRight, geom(0), 1)).toEqual({ x: 100, y: 0 });
  });

  it("rotation 90 (clockwise) maps page top-left to displayed top-right", () => {
    expect(pageToScreen(topLeft, geom(90), 1)).toEqual({ x: 200, y: 0 });
    expect(pageToScreen(topRight, geom(90), 1)).toEqual({ x: 200, y: 100 });
    expect(pageToScreen(bottomLeft, geom(90), 1)).toEqual({ x: 0, y: 0 });
  });

  it("rotation 180 maps page top-left to displayed bottom-right", () => {
    expect(pageToScreen(topLeft, geom(180), 1)).toEqual({ x: 100, y: 200 });
  });

  it("rotation 270 maps page top-left to displayed bottom-left", () => {
    expect(pageToScreen(topLeft, geom(270), 1)).toEqual({ x: 0, y: 100 });
    expect(pageToScreen(topRight, geom(270), 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("screenToPage is the inverse of pageToScreen", () => {
  const rotations: Rotation[] = [0, 90, 180, 270];
  const samples: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: 25, y: 175 },
    { x: 99, y: 1 },
    { x: 50, y: 100 },
  ];

  for (const rotation of rotations) {
    for (const p of samples) {
      it(`round-trips ${JSON.stringify(p)} at ${rotation}deg, zoom 1.5`, () => {
        const zoom = 1.5;
        const screen = pageToScreen(p, geom(rotation), zoom);
        const back = screenToPage(screen, geom(rotation), zoom);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      });
    }
  }
});

describe("pageToPdf flips the y-axis", () => {
  it("maps a top-anchored point to bottom-left origin", () => {
    expect(pageToPdf({ x: 10, y: 0 }, H)).toEqual({ x: 10, y: 200 });
    expect(pageToPdf({ x: 10, y: H }, H)).toEqual({ x: 10, y: 0 });
  });

  it("offsets a box by its height so the bottom edge anchors", () => {
    // A 20pt-tall box whose top is at y=0 should sit with its bottom at y=180.
    expect(pageToPdf({ x: 10, y: 0 }, H, 20)).toEqual({ x: 10, y: 180 });
  });

  it("shifts by the page box origin (cropped / offset MediaBox)", () => {
    // Box origin (30, 40): the same top-left point must land 30 right and,
    // after the y-flip, 40 up from the origin-0 result.
    expect(pageToPdf({ x: 10, y: 0 }, H, 0, { x: 30, y: 40 })).toEqual({ x: 40, y: 240 });
  });
});
