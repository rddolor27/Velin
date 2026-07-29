/**
 * Coordinate conversion between three spaces. Everything else in the editor
 * trusts these functions, so they are pure and unit-tested for all rotations.
 *
 * - **page space**: the unrotated PDF page. Origin top-left, +x right, +y down,
 *   units = PDF points. Annotations are always STORED here, so zoom and rotation
 *   never mutate saved data.
 * - **screen space**: what the user sees. Origin top-left of the displayed
 *   (rotated) page box, units = CSS pixels. Depends on zoom and rotation.
 * - **pdf space**: pdf-lib's draw space. Origin bottom-left, units = points.
 *   Page rotation is applied separately via `setRotation`, so drawing happens in
 *   the *unrotated* system — only the y-axis is flipped.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface PageGeometry {
  /** Unrotated page width in points. */
  width: number;
  /** Unrotated page height in points. */
  height: number;
  rotation: Rotation;
}

/** Normalize any degree value (incl. negatives) to 0/90/180/270. */
export function normalizeRotation(deg: number): Rotation {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return r as Rotation;
}

/** CSS-pixel size of the displayed (rotated, zoomed) page box. */
export function displaySize(page: PageGeometry, zoom: number): { width: number; height: number } {
  const swapped = page.rotation === 90 || page.rotation === 270;
  const w = swapped ? page.height : page.width;
  const h = swapped ? page.width : page.height;
  return { width: w * zoom, height: h * zoom };
}

/** page space (top-left, points) -> screen space (top-left of displayed box, CSS px). */
export function pageToScreen(pt: Point, page: PageGeometry, zoom: number): Point {
  const { width: W, height: H } = page;
  let rx: number;
  let ry: number;
  switch (page.rotation) {
    case 90:
      rx = H - pt.y;
      ry = pt.x;
      break;
    case 180:
      rx = W - pt.x;
      ry = H - pt.y;
      break;
    case 270:
      rx = pt.y;
      ry = W - pt.x;
      break;
    default:
      rx = pt.x;
      ry = pt.y;
  }
  return { x: rx * zoom, y: ry * zoom };
}

/** screen space (CSS px) -> page space (top-left, points). Inverse of pageToScreen. */
export function screenToPage(pt: Point, page: PageGeometry, zoom: number): Point {
  const { width: W, height: H } = page;
  const rx = pt.x / zoom;
  const ry = pt.y / zoom;
  switch (page.rotation) {
    case 90:
      return { x: ry, y: H - rx };
    case 180:
      return { x: W - rx, y: H - ry };
    case 270:
      return { x: W - ry, y: rx };
    default:
      return { x: rx, y: ry };
  }
}

/**
 * page space (top-left, points) -> pdf-lib draw space (bottom-left, points).
 * Rotation is NOT applied here — pdf-lib's `setRotation` handles it, and drawing
 * occurs in the unrotated system. `boxHeight` shifts a top-anchored box (text
 * line, image) down to its bottom edge so pdf-lib's bottom-left anchor lands right.
 *
 * `origin` is the page box's lower-left corner (CropBox/MediaBox x/y). It's
 * usually (0, 0), but pages that are cropped or whose MediaBox doesn't start at
 * the origin need it, or annotations land shifted by that offset on export.
 */
export function pageToPdf(
  pt: Point,
  pageHeight: number,
  boxHeight = 0,
  origin: Point = { x: 0, y: 0 },
): Point {
  return { x: origin.x + pt.x, y: origin.y + pageHeight - pt.y - boxHeight };
}
