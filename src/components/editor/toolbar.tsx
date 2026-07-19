"use client";

import { useState } from "react";
import {
  Download,
  FilePlus2,
  MousePointer2,
  PenLine,
  Redo2,
  Scissors,
  Signature,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { exportPdf, downloadPdf } from "@/lib/pdf/export";
import type { Tool } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { SignatureDialog } from "./signature-dialog";

const TOOLS: { value: Tool; label: string; icon: React.ElementType }[] = [
  { value: "select", label: "Select / move", icon: MousePointer2 },
  { value: "text", label: "Add text", icon: Type },
  { value: "signature", label: "Signature", icon: Signature },
  { value: "pen", label: "Draw", icon: PenLine },
];

function outputName(fileName: string | null) {
  const base = (fileName ?? "document.pdf").replace(/\.pdf$/i, "");
  return `${base} (edited).pdf`;
}

export function Toolbar({ onOpenNew }: { onOpenNew: () => void }) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const zoom = useEditorStore((s) => s.zoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const pageSelection = useEditorStore((s) => s.pageSelection);
  const [sigOpen, setSigOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const runExport = async (subset?: string[]) => {
    const { sourceBytes, pages, annotations, fileName } = useEditorStore.getState();
    if (!sourceBytes) return;
    setExporting(true);
    try {
      const bytes = await exportPdf({ sourceBytes, pages, annotations, pageSubset: subset });
      downloadPdf(bytes, outputName(fileName));
      toast.success(subset ? "Exported selected pages." : "PDF saved.");
    } catch (err) {
      toast.error(String((err as Error)?.message ?? "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const onToolChange = (value: string) => {
    if (!value) return;
    if (value === "signature") {
      setSigOpen(true);
      return;
    }
    setTool(value as Tool);
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <Button variant="outline" size="sm" onClick={onOpenNew} className="gap-2">
        <FilePlus2 className="h-4 w-4" />
        Open
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToggleGroup type="single" value={tool} onValueChange={onToolChange} className="gap-1">
        {TOOLS.map(({ value, label, icon: Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={value}
                aria-label={label}
                className="data-[state=on]:bg-brand data-[state=on]:text-brand-foreground"
              >
                <Icon className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={zoomOut} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={zoomIn} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} aria-label="Undo">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} aria-label="Redo">
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {pageSelection.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={exporting}
            onClick={() => runExport(pageSelection)}
          >
            <Scissors className="h-4 w-4" />
            Extract {pageSelection.length}
          </Button>
        )}
        <Button size="sm" className="gap-2" disabled={exporting} onClick={() => runExport()}>
          <Download className="h-4 w-4" />
          Save PDF
        </Button>
        <ThemeToggle />
      </div>

      <SignatureDialog open={sigOpen} onOpenChange={setSigOpen} />
    </header>
  );
}
