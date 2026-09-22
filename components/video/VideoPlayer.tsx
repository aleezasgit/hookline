"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { cn } from "cn";
import type { Aspect } from "@/lib/types";

interface VideoPlayerProps {
  src: string;
  aspect?: Aspect;
  mode: "hover" | "autoplay" | "controls";
  caption?: string | null;
  showCaption?: boolean;
  className?: string;
}

const ASPECT_CLASS: Record<Aspect, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
  "1:1": "aspect-square",
};

export function VideoPlayer({ src, aspect = "9:16", mode, caption, showCaption = true, className }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(mode !== "autoplay");
  const [failed, setFailed] = useState(false);
  const [failedForSrc, setFailedForSrc] = useState(src);
  // Reset the failure flag when src changes, during render (React's documented
  // pattern for adjusting state from props) rather than in an effect.
  if (src !== failedForSrc) {
    setFailedForSrc(src);
    if (failed) setFailed(false);
  }

  useEffect(() => {
    // The browser can start fetching `src` from the server-rendered markup and fire
    // its native `error` event before React finishes hydrating and attaches the
    // onError listener below, so a failure that happens that early would otherwise
    // go unnoticed. Catch that case once, right after mount.
    if (ref.current?.error) setFailed(true);
  }, []);

  useEffect(() => {
    if (mode !== "autoplay" || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);

  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== "autoplay") return;
    if (inView) el.play().catch(() => {});
    else el.pause();
  }, [inView, mode]);

  const handlers = mode === "hover" ? {
    onPointerEnter: () => ref.current?.play().catch(() => {}),
    onPointerLeave: () => {
      const el = ref.current;
      if (el) { el.pause(); el.currentTime = 0; }
    },
  } : {};

  if (!src || failed) {
    return (
      <div className={cn("relative flex items-center justify-center overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-surface-2 to-black", ASPECT_CLASS[aspect], className)}>
        <Film className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[var(--radius)] bg-black", ASPECT_CLASS[aspect], className)} {...handlers}>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        loop
        controls={mode === "controls"}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      {showCaption && caption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[25%] items-end justify-center bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 text-center">
          <p className="line-clamp-2 text-base font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
            {caption}
          </p>
        </div>
      ) : null}
    </div>
  );
}
