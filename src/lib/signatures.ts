"use client";

import type { SavedSignature } from "./types";

const KEY = "pdf-editor:saved-signatures";

export function loadSavedSignatures(): SavedSignature[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSignature[]) : [];
  } catch {
    return [];
  }
}

export function saveSignature(sig: SavedSignature): SavedSignature[] {
  const all = [sig, ...loadSavedSignatures()].slice(0, 12);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Out of storage quota — high-resolution captures add up. Keep the signature
    // usable for this session rather than failing to place it.
  }
  return all;
}

export function deleteSavedSignature(id: string): SavedSignature[] {
  const all = loadSavedSignatures().filter((s) => s.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}
