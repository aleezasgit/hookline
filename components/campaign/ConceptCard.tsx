"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { HOOK_TYPES } from "@/config/hooks";
import { PRESETS } from "@/config/presets";
import type { Concept, ConceptView } from "@/lib/types";

interface ConceptCardProps {
  concept: ConceptView;
  onMutate: () => void;
  className?: string;
}

type EditablePatch = Partial<Pick<Concept, "hookLine" | "visualPrompt" | "caption" | "presetKey" | "selected">>;

export function ConceptCard({ concept, onMutate, className }: ConceptCardProps) {
  const hasVideo = concept.versions.length > 0;

  // Keep the latest server row around so blur handlers can compare against it
  // without becoming stale closures.
  const conceptRef = useRef(concept);
  useEffect(() => {
    conceptRef.current = concept;
  }, [concept]);
  const focused = useRef<Record<string, boolean>>({});

  const [hookLine, setHookLine] = useState(concept.hookLine);
  const [visualPrompt, setVisualPrompt] = useState(concept.visualPrompt);
  const [caption, setCaption] = useState(concept.caption);
  const [expanded, setExpanded] = useState(false);
  const [rerolling, setRerolling] = useState(false);

  // Only resync from the server while the field isn't being actively edited, so a
  // poll or a reroll never clobbers text the user is mid-typing.
  useEffect(() => {
    if (!focused.current.hookLine) setHookLine(concept.hookLine);
  }, [concept.hookLine]);
  useEffect(() => {
    if (!focused.current.visualPrompt) setVisualPrompt(concept.visualPrompt);
  }, [concept.visualPrompt]);
  useEffect(() => {
    if (!focused.current.caption) setCaption(concept.caption);
  }, [concept.caption]);

  async function patch(body: EditablePatch) {
    try {
      await api.patch(`/api/concepts/${concept.id}`, body);
      onMutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save. Try again.");
      onMutate();
    }
  }

  async function reroll() {
    setRerolling(true);
    try {
      await api.post(`/api/concepts/${concept.id}/reroll`);
      onMutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not write a new hook. Try again.");
    } finally {
      setRerolling(false);
    }
  }

  const hookType = HOOK_TYPES[concept.hookType as keyof typeof HOOK_TYPES];

  return (
    <div className={cn("flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        {!hasVideo ? (
          <Checkbox
            checked={concept.selected}
            onCheckedChange={() => patch({ selected: !concept.selected })}
            aria-label="Include this hook in the batch"
          />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{hookType?.label ?? concept.hookType}</Badge>
          {hasVideo ? (
            <Badge variant="secondary">Has video</Badge>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={reroll}
                  disabled={rerolling}
                  aria-label="Write a different hook"
                >
                  <RefreshCw className={cn("size-3.5", rerolling && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Write a different hook</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Input
        value={hookLine}
        disabled={hasVideo}
        onFocus={() => {
          focused.current.hookLine = true;
        }}
        onChange={(e) => setHookLine(e.target.value)}
        onBlur={() => {
          focused.current.hookLine = false;
          if (hookLine.trim() && hookLine !== conceptRef.current.hookLine) patch({ hookLine });
        }}
        className="h-auto border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
      />

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">What the video shows</p>
        <Textarea
          value={visualPrompt}
          disabled={hasVideo}
          rows={expanded ? 6 : 3}
          onFocus={() => {
            focused.current.visualPrompt = true;
          }}
          onChange={(e) => setVisualPrompt(e.target.value)}
          onBlur={() => {
            focused.current.visualPrompt = false;
            if (visualPrompt.trim() && visualPrompt !== conceptRef.current.visualPrompt) patch({ visualPrompt });
          }}
          className={cn(!expanded && "max-h-[4.75rem] overflow-hidden")}
        />
        {!hasVideo ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-primary hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Preset</p>
        <Select value={concept.presetKey} disabled={hasVideo} onValueChange={(v) => patch({ presetKey: v })}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Caption</span>
          <span>{caption.length}/300</span>
        </p>
        <Textarea
          value={caption}
          disabled={hasVideo}
          rows={2}
          maxLength={300}
          onFocus={() => {
            focused.current.caption = true;
          }}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            focused.current.caption = false;
            if (caption.trim() && caption !== conceptRef.current.caption) patch({ caption });
          }}
        />
      </div>
    </div>
  );
}
