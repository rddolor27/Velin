"use client";

import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StandardFontKey } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { useToolSettings } from "@/store/tool-settings";

const SWATCHES = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className="h-5 w-5 rounded-full border shadow-sm data-[active=true]:ring-2 data-[active=true]:ring-brand data-[active=true]:ring-offset-1"
          data-active={value === c}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function ToolOptions() {
  const tool = useEditorStore((s) => s.tool);
  const t = useToolSettings();

  if (tool !== "text" && tool !== "pen") return null;

  return (
    <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-1.5 text-sm">
      {tool === "text" ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Font</span>
            <Select value={t.textFont} onValueChange={(v) => t.setTextFont(v as StandardFontKey)}>
              <SelectTrigger size="sm" className="h-7 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Helvetica">Helvetica</SelectItem>
                <SelectItem value="TimesRoman">Times</SelectItem>
                <SelectItem value="Courier">Courier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Size</span>
            <Slider
              className="w-28"
              min={8}
              max={72}
              step={1}
              value={[t.textSize]}
              onValueChange={([v]) => t.setTextSize(v)}
            />
            <span className="w-6 tabular-nums text-muted-foreground">{t.textSize}</span>
          </div>
          <Swatches value={t.textColor} onChange={t.setTextColor} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Stroke</span>
            <Slider
              className="w-28"
              min={1}
              max={16}
              step={1}
              value={[t.penSize]}
              onValueChange={([v]) => t.setPenSize(v)}
            />
            <span className="w-6 tabular-nums text-muted-foreground">{t.penSize}</span>
          </div>
          <Swatches value={t.penColor} onChange={t.setPenColor} />
        </>
      )}
    </div>
  );
}
