"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "cn";
import { resizeImage } from "@/lib/media/resize";
import { api, ApiError } from "@/lib/api";
import { CLIENT } from "@/config/client";

// NOTE: components/create/ImageDropzone.tsx is owned by the clone-UI track and may
// not exist yet, and campaign UI must stay inside its own files. This is a small,
// self-contained equivalent scoped to the brief's product photo (always letterboxed
// to 9:16, since every campaign clip starts from this photo).
interface BriefPhotoDropzoneProps {
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}

export function BriefPhotoDropzone({ value, onChange, className }: BriefPhotoDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!CLIENT.allowedImageTypes.includes(file.type)) {
      toast.error("This image type is not supported. Use a JPG, PNG or WebP.");
      return;
    }
    setUploading(true);
    try {
      let blob: Blob;
      try {
        blob = await resizeImage(file, { fitAspect: "9:16" });
      } catch {
        // createImageBitmap throws on a file whose extension lied about its
        // format (e.g. a renamed HEIC) or that's simply corrupt.
        toast.error("This image type is not supported. Use a JPG, PNG or WebP.");
        return;
      }
      const form = new FormData();
      form.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const { url } = await api.post<{ url: string }>("/api/upload", form);
      onChange(url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not upload the image. Try again.");
    } finally {
      setUploading(false);
    }
  }

  if (value) {
    return (
      <div className={cn("relative w-40 overflow-hidden rounded-[var(--radius)] border border-border", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Product photo" className="aspect-[9/16] w-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white"
          aria-label="Remove photo"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0] ?? null);
      }}
      onPaste={(e) => {
        const file = Array.from(e.clipboardData?.files ?? [])[0];
        handleFile(file ?? null);
      }}
      disabled={uploading}
      className={cn(
        "flex aspect-[9/16] w-40 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border bg-surface-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        dragOver && "border-primary text-foreground",
        className,
      )}
    >
      {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
      <span>{uploading ? "Uploading..." : "Add a photo"}</span>
      <input
        ref={inputRef}
        type="file"
        accept={CLIENT.allowedImageTypes.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </button>
  );
}
