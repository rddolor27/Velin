import getStroke from "perfect-freehand";

/**
 * perfect-freehand outline -> SVG path data, in whatever units `points` use.
 * Shared by the on-screen layer and the exporter so a saved stroke has exactly
 * the geometry that was previewed — the outline is scale-invariant, so page
 * points and zoomed CSS pixels both produce the same shape.
 */
export function strokePath(points: number[][], size: number): string {
  const outline = getStroke(points, { size: Math.max(1, size), thinning: 0.6, streamline: 0.5 });
  if (outline.length === 0) return "";
  return (
    outline.reduce((acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`), "") + " Z"
  );
}
