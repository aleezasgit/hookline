"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { resizeImage } from "@/lib/media/resize";
import { api, ApiError } from "@/lib/api";
import { CLIENT } from "@/config/client";

interface ImageDropzoneProps {
  value: string | null;
  onChange: (url: string | null) => void;
  fitAspect?: "9:16";
  className?: string;
}

export function ImageDropzone({ value, onChange, fitAspect, className }: ImageDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!CLIENT.allowedImageTypes.includes(file.type)) {
        toast.error("This image type is not supported. Use a JPG, PNG or WebP.");
        return;
      }
      setUploading(true);
      try {
        let blob: Blob;
        try {
          blob = await resizeImage(file, fitAspect ? { fitAspect } : {});
        } catch {
          // createImageBitmap throws on a file whose extension lied about its
          // format (e.g. a renamed HEIC) or that's simply corrupt.
          toast.error("This image type is not supported. Use a JPG, PNG or WebP.");
          return;
        }
        const form = new FormData();
        form.append("file", blob, file.name || "image.jpg");
        const { url } = await api.post<{ url: string }>("/api/upload", form);
        onChange(url);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Could not upload the image. Try again.");
      } finally {
        setUploading(false);
      }
    },
    [fitAspect, onChange],
  );

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) upload(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) upload(file);
  }

  const aspectClass = fitAspect === "9:16" ? "aspect-[9/16]" : "aspect-video";

  if (value) {
    return (
      <div className={cn("relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2", aspectClass, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Uploaded photo" className="h-full w-full object-cover" />
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          onClick={() => onChange(null)}
          className="absolute right-2 top-2 bg-black/70 text-white hover:bg-black/90"
          aria-label="Remove image"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label="Add a photo"
      onPaste={handlePaste}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!uploading && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border bg-surface-2 p-6 text-center outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
        aspectClass,
        dragOver && "border-primary bg-surface",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={CLIENT.allowedImageTypes.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Uploading...</p>
        </>
      ) : (
        <>
          <Upload className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Drop a photo, click to browse, or paste</p>
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 4 MB</p>
        </>
      )}
    </div>
  );
}
