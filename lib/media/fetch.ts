export async function fetchVideoBlob(url: string): Promise<Blob> {
  if (url.startsWith("/")) return (await fetch(url)).blob(); // mock files
  try {
    const r = await fetch(url, { mode: "cors" });
    if (r.ok) return await r.blob();
  } catch {}
  const r = await fetch(`/api/media?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("Could not load the video.");
  return r.blob();
}

export async function downloadVideo(url: string, filename: string) {
  const blob = await fetchVideoBlob(url);
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
