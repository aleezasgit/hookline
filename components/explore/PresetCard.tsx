"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import type { Preset } from "@/config/presets";

interface PresetCardProps {
  preset: Preset;
  className?: string;
  /** When provided, the card acts as a select button instead of a link (used by PresetPicker's dialog). */
  onSelect?: () => void;
  selected?: boolean;
}

export function PresetCard({ preset, className, onSelect, selected }: PresetCardProps) {
  const [broken, setBroken] = useState(false);
  const probeRef = useRef<HTMLVideoElement>(null);
  const src = `/previews/${preset.key}.mp4`;

  useEffect(() => {
    // The browser can fetch this probe's `src` straight from the server-rendered
    // markup and fail before React finishes hydrating and attaches the onError
    // handler below, so a failure that happens that early would otherwise be missed.
    if (probeRef.current?.error) setBroken(true);
  }, []);

  const media = (
    <div
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2",
        selected && "ring-2 ring-primary",
      )}
    >
      <VideoPlayer src={src} mode="hover" showCaption={false} className="aspect-[3/4] rounded-none border-0" />
      {/*
        NOTE: VideoPlayer's own fallback (a Film icon on a plain gradient) has no way to know
        the preset name and exposes no onError callback for a parent to hook into, and it's
        frozen (owned by another track). Preview clips under public/previews don't exist yet
        in this environment, so this hidden probe video detects the same 404 and layers the
        preset name over an accent gradient on top, matching the Explore spec (14.2 / 14.3).
        Once real preview files land, this overlay simply never triggers.
      */}
      <video
        ref={probeRef}
        src={src}
        muted
        preload="metadata"
        className="hidden"
        onError={() => setBroken(true)}
        onLoadedData={() => setBroken(false)}
      />
      {broken ? (
        <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-br from-primary/40 via-black/70 to-black p-3">
          <p className="text-xl font-bold leading-tight text-foreground">{preset.name}</p>
        </div>
      ) : null}
    </div>
  );

  const text = (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-foreground">{preset.name}</p>
      <p className="line-clamp-1 text-xs text-muted-foreground">{preset.description}</p>
    </div>
  );

  const wrapperClass = cn(
    "group flex flex-col gap-2 rounded-[var(--radius)] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={wrapperClass}>
        {media}
        {text}
      </button>
    );
  }

  return (
    <Link href={`/create?preset=${preset.key}`} className={wrapperClass}>
      {media}
      {text}
    </Link>
  );
}
