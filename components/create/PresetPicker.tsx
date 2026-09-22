"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PresetCard } from "@/components/explore/PresetCard";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { PRESETS, getPreset } from "@/config/presets";
import type { PresetCategory } from "@/lib/types";
import { cn } from "cn";

const CATEGORIES: { key: PresetCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "camera", label: "Camera" },
  { key: "effects", label: "Effects" },
  { key: "ugc", label: "UGC" },
];

interface PresetPickerProps {
  presetKey: string | null;
  onChange: (key: string | null) => void;
}

export function PresetPicker({ presetKey, onChange }: PresetPickerProps) {
  const [open, setOpen] = useState(false);
  const preset = getPreset(presetKey);

  function choose(key: string | null) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface p-3">
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
        {preset ? (
          <VideoPlayer
            src={`/previews/${preset.key}.mp4`}
            mode="hover"
            showCaption={false}
            className="h-16 w-12 rounded-none border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-[10px] leading-tight text-muted-foreground">
            No preset
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Preset</p>
        <p className="truncate text-sm font-medium">{preset ? preset.name : "No preset"}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a preset</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="all">
            <TabsList>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c.key} value={c.key}>
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {CATEGORIES.map((c) => (
              <TabsContent key={c.key} value={c.key}>
                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className={cn(
                      "flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-dashed border-border bg-surface-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
                      !presetKey && "border-primary text-foreground",
                    )}
                  >
                    No preset
                  </button>
                  {PRESETS.filter((p) => c.key === "all" || p.category === c.key).map((p) => (
                    <PresetCard
                      key={p.key}
                      preset={p}
                      onSelect={() => choose(p.key)}
                      selected={presetKey === p.key}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
