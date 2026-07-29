/**
 * Shared text-layout constants so the on-screen overlay and the pdf-lib export
 * agree. HTML lays text out inside a line-height box and draws from the top;
 * pdf-lib draws from the glyph baseline. To make "what you see" match "what you
 * save", both sides use LINE_HEIGHT for line advance, and export offsets the
 * baseline by BASELINE_RATIO of the font size — the distance from a line box's
 * top down to the baseline that the browser produces at this line-height.
 */
export const LINE_HEIGHT = 1.2;

/** ~half-leading + ascent for a Helvetica/Arial line box at LINE_HEIGHT 1.2. */
export const BASELINE_RATIO = 0.95;
