"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  loadSavedSignatures,
  saveSignature,
  deleteSavedSignature,
} from "@/lib/signatures";
import type { SavedSignature } from "@/lib/types";
import { newId } from "@/store/editor-store";
import { useToolSettings } from "@/store/tool-settings";
import { useEditorStore } from "@/store/editor-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignatureDialog({ open, onOpenChange }: Props) {
  const setPending = useToolSettings((s) => s.setPendingSignature);
  const setTool = useEditorStore((s) => s.setTool);
  const [saved, setSaved] = useState<SavedSignature[]>([]);

  useEffect(() => {
    if (open) setSaved(loadSavedSignatures());
  }, [open]);

  const choose = (dataUrl: string, aspect: number, persist: boolean) => {
    if (persist) {
      const sig: SavedSignature = { id: newId(), dataUrl, aspect, createdAt: 0 };
      setSaved(saveSignature(sig));
    }
    setPending({ dataUrl, aspect });
    setTool("signature");
    onOpenChange(false);
    toast.info("Click a page to place your signature.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a signature</DialogTitle>
          <DialogDescription>Draw one, or upload an image.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="draw">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>

          <TabsContent value="draw">
            <DrawPad onDone={(url, aspect) => choose(url, aspect, true)} />
          </TabsContent>

          <TabsContent value="upload">
            <UploadPane onDone={(url, aspect) => choose(url, aspect, true)} />
          </TabsContent>

          <TabsContent value="saved">
            <SavedPane
              saved={saved}
              onPick={(s) => choose(s.dataUrl, s.aspect, false)}
              onDelete={(id) => setSaved(deleteSavedSignature(id))}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// The pad is captured at several times its on-screen size: a signature placed at
// the default 160pt width then carries ~750 DPI of detail, so it stays sharp when
// resized up or printed instead of being pinned to the preview's resolution.
const PAD_SCALE = 3;
const PAD_WIDTH = 560 * PAD_SCALE;
const PAD_HEIGHT = 220 * PAD_SCALE;

function DrawPad({ onDone }: { onDone: (url: string, aspect: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5 * PAD_SCALE; // same apparent thickness at the larger backing size
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setDirty(true);
  };
  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDirty(false);
  };

  return (
    <div className="space-y-3 py-2">
      <canvas
        ref={canvasRef}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-md border bg-white"
      />
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={clear} disabled={!dirty}>
          Clear
        </Button>
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => {
            const c = canvasRef.current!;
            onDone(c.toDataURL("image/png"), c.width / c.height);
          }}
        >
          Use signature
        </Button>
      </div>
    </div>
  );
}

function UploadPane({ onDone }: { onDone: (url: string, aspect: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  const handle = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => onDone(url, img.width / img.height);
      img.onerror = () => toast.error("Couldn't read that image.");
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="py-6">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed py-12 text-muted-foreground hover:border-brand/60 hover:bg-muted/50"
      >
        <Upload className="h-8 w-8" />
        <span className="text-sm">Click to choose a PNG or JPG</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SavedPane({
  saved,
  onPick,
  onDelete,
}: {
  saved: SavedSignature[];
  onPick: (s: SavedSignature) => void;
  onDelete: (id: string) => void;
}) {
  if (saved.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No saved signatures yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 py-3">
      {saved.map((s) => (
        <div key={s.id} className="group relative rounded-md border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.dataUrl}
            alt="Saved signature"
            className="h-16 w-full cursor-pointer object-contain"
            onClick={() => onPick(s)}
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={() => onDelete(s.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
