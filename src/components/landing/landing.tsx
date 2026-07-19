"use client";

import { useRef, useState } from "react";
import {
  FileUp,
  Highlighter,
  Loader2,
  Lock,
  MousePointerClick,
  PenLine,
  Signature,
  Type,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { cn } from "@/lib/utils";
import { useLoadPdf } from "@/lib/use-load-pdf";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  { icon: MousePointerClick, title: "Organize pages", body: "Remove, reorder, rotate, and extract pages by dragging thumbnails." },
  { icon: Type, title: "Add text", body: "Click anywhere to type, with font, size, and color controls." },
  { icon: Signature, title: "Sign it", body: "Draw a signature or drop in an image — reuse the ones you save." },
  { icon: PenLine, title: "Draw freehand", body: "A smooth pen for notes, marks, and quick corrections." },
  { icon: Highlighter, title: "Export clean", body: "Download a flattened PDF that's ready to send." },
  { icon: Lock, title: "Private by design", body: "Everything runs in your browser. Your file is never uploaded." },
];

export function Landing({ onLoaded }: { onLoaded: (pdf: PDFDocumentProxy) => void }) {
  const { loadFile, busy } = useLoadPdf(onLoaded);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="velin-landing relative flex min-h-screen flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = "";
        }}
      />

      {/* Top bar */}
      <header className="z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-semibold tracking-tight">Velin</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            PDF Editor
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={openPicker}>
            Open PDF
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <main className="z-10 flex flex-1 flex-col items-center px-6 pb-20 pt-8 text-center sm:pt-16">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Lock className="h-3 w-3" />
          Private, in-browser PDF editing
        </span>

        <h1 className="max-w-3xl font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Edit your PDFs without <span className="italic">ever</span> giving them away.
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Remove pages, add text, sign, and draw — all on your machine. Velin never
          uploads your document. Open a file to start.
        </p>

        {/* Drop card */}
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void loadFile(file);
          }}
          className={cn(
            "group mt-10 flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-background/60 px-8 py-14 shadow-sm backdrop-blur transition-colors",
            dragging
              ? "border-brand bg-brand/5"
              : "border-border hover:border-brand/60 hover:bg-background/80",
          )}
        >
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
          ) : (
            <FileUp className="h-10 w-10 text-muted-foreground transition-colors group-hover:text-brand" />
          )}
          <div className="space-y-1">
            <p className="text-lg font-medium">
              {busy ? "Opening…" : "Drop a PDF here, or click to browse"}
            </p>
            <p className="text-sm text-muted-foreground">Works with any PDF on your device.</p>
          </div>
        </button>

        {/* Features */}
        <section className="mt-24 w-full max-w-5xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border bg-background/60 p-5 text-left backdrop-blur transition-colors hover:border-brand/50"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy band */}
        <section className="mt-16 w-full max-w-5xl rounded-2xl border bg-background/50 p-8 text-left backdrop-blur sm:p-10">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold">Nothing leaves this tab</h2>
              <p className="mt-1 text-muted-foreground">
                Velin has no backend. Your PDF is read, edited, and saved entirely in your
                browser — so there's nothing to upload, store, or leak.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="z-10 border-t px-6 py-6 text-center text-sm text-muted-foreground sm:px-10">
        Velin — client-side PDF editing.
      </footer>
    </div>
  );
}
