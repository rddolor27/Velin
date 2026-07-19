"use client";

import { create } from "zustand";

import type { StandardFontKey } from "@/lib/types";

interface ToolSettings {
  textColor: string;
  textSize: number;
  textFont: StandardFontKey;
  penColor: string;
  penSize: number;
  /** Signature chosen from the dialog, waiting to be placed on a page. */
  pendingSignature: { dataUrl: string; aspect: number } | null;

  setTextColor: (c: string) => void;
  setTextSize: (n: number) => void;
  setTextFont: (f: StandardFontKey) => void;
  setPenColor: (c: string) => void;
  setPenSize: (n: number) => void;
  setPendingSignature: (s: { dataUrl: string; aspect: number } | null) => void;
}

export const useToolSettings = create<ToolSettings>((set) => ({
  textColor: "#111827",
  textSize: 16,
  textFont: "Helvetica",
  penColor: "#2563eb",
  penSize: 3,
  pendingSignature: null,

  setTextColor: (textColor) => set({ textColor }),
  setTextSize: (textSize) => set({ textSize }),
  setTextFont: (textFont) => set({ textFont }),
  setPenColor: (penColor) => set({ penColor }),
  setPenSize: (penSize) => set({ penSize }),
  setPendingSignature: (pendingSignature) => set({ pendingSignature }),
}));
