"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCcw, RotateCw, Scissors, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PageEntry } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { Thumbnail } from "./thumbnail";

export function ThumbnailSidebar() {
  const pages = useEditorStore((s) => s.pages);
  const reorderPages = useEditorStore((s) => s.reorderPages);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) {
      reorderPages(String(e.active.id), String(e.over.id));
    }
  };

  return (
    <aside className="flex w-[190px] shrink-0 flex-col border-r bg-muted/30">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
        {pages.length} page{pages.length === 1 ? "" : "s"}
      </div>
      <ScrollArea className="flex-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2 px-3 pb-4">
              {pages.map((page, i) => (
                <SortableThumb key={page.id} page={page} index={i} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </ScrollArea>
    </aside>
  );
}

function SortableThumb({ page, index }: { page: PageEntry; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const rotatePage = useEditorStore((s) => s.rotatePage);
  const removePage = useEditorStore((s) => s.removePage);
  const pageSelection = useEditorStore((s) => s.pageSelection);
  const togglePageSelection = useEditorStore((s) => s.togglePageSelection);
  const pageCount = useEditorStore((s) => s.pages.length);
  const selected = pageSelection.includes(page.id);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-80")}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "group relative rounded-md border-2 p-2 transition-colors",
              selected ? "border-brand" : "border-transparent hover:border-border",
            )}
          >
            <div className="absolute left-3 top-3 z-10">
              <Checkbox
                checked={selected}
                onCheckedChange={() => togglePageSelection(page.id)}
                className="bg-background opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
                aria-label={`Select page ${index + 1}`}
              />
            </div>
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
              <Thumbnail page={page} />
            </div>
            <div className="mt-1 text-center text-xs text-muted-foreground">{index + 1}</div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => rotatePage(page.id, -90)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Rotate left
          </ContextMenuItem>
          <ContextMenuItem onClick={() => rotatePage(page.id, 90)}>
            <RotateCw className="mr-2 h-4 w-4" />
            Rotate right
          </ContextMenuItem>
          <ContextMenuItem onClick={() => togglePageSelection(page.id)}>
            <Scissors className="mr-2 h-4 w-4" />
            {selected ? "Deselect" : "Select for extract"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={pageCount === 1}
            onClick={() => removePage(page.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete page
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}
