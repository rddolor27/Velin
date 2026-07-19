import type { Rotation } from "./coords";

export type Tool = "select" | "text" | "signature" | "pen";

/** A page in the working document. Order in the array = document order. */
export interface PageEntry {
  /** Stable id, survives reorder/remove so annotations never get misassigned. */
  id: string;
  /** Index into the ORIGINAL loaded PDF. */
  sourceIndex: number;
  rotation: Rotation;
  /** Unrotated intrinsic size in PDF points, read once at load. */
  width: number;
  height: number;
}

interface BaseAnnotation {
  id: string;
  /** page space: top-left origin, PDF points (see lib/coords). */
  x: number;
  y: number;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  text: string;
  /** Font size in points. */
  size: number;
  /** Hex color, e.g. "#111827". */
  color: string;
  fontFamily: StandardFontKey;
  /** Box width in points (height derives from wrapped lines). */
  width: number;
}

export interface SignatureAnnotation extends BaseAnnotation {
  kind: "signature";
  /** PNG/JPEG data URL. */
  dataUrl: string;
  width: number;
  height: number;
  /** Intrinsic pixel ratio, to keep the aspect lock on resize. */
  aspect: number;
}

export interface InkAnnotation extends BaseAnnotation {
  kind: "ink";
  /** Stroke points in page space, relative to (x, y). */
  points: { x: number; y: number }[];
  color: string;
  /** Stroke width in points. */
  size: number;
}

export type Annotation = TextAnnotation | SignatureAnnotation | InkAnnotation;

export type StandardFontKey =
  | "Helvetica"
  | "TimesRoman"
  | "Courier";

/** A signature the user saved for reuse (persisted to localStorage). */
export interface SavedSignature {
  id: string;
  dataUrl: string;
  aspect: number;
  createdAt: number;
}
