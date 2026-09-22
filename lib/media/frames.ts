const once = (el: HTMLElement, ev: string) => new Promise<void>((r) => el.addEventListener(ev, () => r(), { once: true }));

export async function captureFrames(blob: Blob): Promise<string[]> {
  const src = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = src;
  await once(video, "loadeddata");
  const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
  // H9: 3 frames, not 4. qwen3.8-27b (the review model) rejects a 4-image
  // request outright with "This model supports up to 3 images", found by the
  // AI eval script. Start, middle and end still cover the hook and the arc.
  const times = [0.5, d / 2, d - 0.1].map((t) => Math.max(0, Math.min(t, d - 0.05)));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * (video.videoHeight / video.videoWidth || 16 / 9));
  const ctx = canvas.getContext("2d")!;
  const frames: string[] = [];
  for (const t of times) {
    video.currentTime = t;
    await once(video, "seeked");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  URL.revokeObjectURL(src);
  return frames;
}
