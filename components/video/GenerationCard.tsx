"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { AlertTriangle } from "lucide-react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { api, ApiError } from "@/lib/api";
import type { Aspect, Generation } from "@/lib/types";

const ASPECT_CLASS: Record<Aspect, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
  "1:1": "aspect-square",
};

function useElapsed(createdAt: string) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function formatElapsed(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

interface GenerationCardProps {
  generation: Generation;
  mode: "hover" | "autoplay" | "controls";
  caption?: string | null;
  onSelect?: () => void;
  selected?: boolean;
  onRetried?: (g: Generation) => void;
  className?: string;
}

export function GenerationCard({ generation, mode, caption, onSelect, selected, onRetried, className }: GenerationCardProps) {
  const elapsed = useElapsed(generation.createdAt);
  const [retrying, setRetrying] = useState(false);
  const aspectClass = ASPECT_CLASS[generation.aspect];

  async function retry() {
    setRetrying(true);
    try {
      const { generation: fresh } = await api.postIdempotent<{ generation: Generation }>(`/api/generations/${generation.id}/retry`);
      // Retrying spends credits and can be shown from three different pages (Create,
      // Library, the campaign review board), each backed by its own SWR key. Revalidate
      // every list/view that could contain this generation, plus the balance, rather
      // than relying on each caller to remember to pass onRetried and mutate itself.
      globalMutate("/api/workspace");
      globalMutate(
        (key) => typeof key === "string" && (key.startsWith("/api/generations") || key.startsWith("/api/campaigns")),
        undefined,
        { revalidate: true },
      );
      onRetried?.(fresh);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not retry. Try again.");
    } finally {
      setRetrying(false);
    }
  }

  const wrapperProps = onSelect
    ? { role: "button" as const, tabIndex: 0, onClick: onSelect, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") onSelect(); } }
    : {};

  if (generation.status === "queued" || generation.status === "running") {
    const label = generation.status === "queued" ? "In queue" : "Generating";
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2",
          aspectClass,
          onSelect && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
          selected && "ring-2 ring-primary",
          className,
        )}
        {...wrapperProps}
      >
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            {label} &middot; {formatElapsed(elapsed)}
          </span>
        </div>
      </div>
    );
  }

  if (generation.status === "failed") {
    const message = generation.error ?? "Generation failed.";
    // Some server error messages already end with "Credits refunded." (e.g. the
    // timeout case); others don't (a raw provider error). Only append it here for
    // the ones that don't say so, so the failure text never repeats itself.
    const fullMessage = /credits refunded\.?$/i.test(message) ? message : `${message} Credits refunded.`;
    return (
      <div className={cn("flex flex-col justify-between gap-3 rounded-[var(--radius)] border border-destructive/30 bg-surface-2 p-4", aspectClass, className)}>
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{fullMessage}</span>
        </div>
        <Button size="sm" variant="secondary" onClick={retry} disabled={retrying}>
          {retrying ? "Retrying..." : "Try again"}
        </Button>
      </div>
    );
  }

  // done
  return (
    <div
      className={cn(
        "relative",
        onSelect && "cursor-pointer rounded-[var(--radius)] focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-primary",
        className,
      )}
      {...wrapperProps}
    >
      <VideoPlayer
        src={generation.outputUrl ?? ""}
        aspect={generation.aspect}
        mode={mode}
        caption={caption}
        showCaption={!!caption}
      />
      {generation.tier === "final" ? (
        <Badge className="absolute right-2 top-2 bg-primary text-primary-foreground">Pro</Badge>
      ) : null}
    </div>
  );
}
