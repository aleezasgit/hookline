export async function resizeImage(file: File, opts: { fitAspect?: "9:16" } = {}): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  if (opts.fitAspect === "9:16") {
    canvas.width = 864; canvas.height = 1536;
    // blurred cover background
    const cover = Math.max(canvas.width / bmp.width, canvas.height / bmp.height);
    ctx.filter = "blur(40px) brightness(0.8)";
    ctx.drawImage(bmp, (canvas.width - bmp.width * cover) / 2, (canvas.height - bmp.height * cover) / 2,
      bmp.width * cover, bmp.height * cover);
    ctx.filter = "none";
    // sharp contained foreground
    const contain = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
    ctx.drawImage(bmp, (canvas.width - bmp.width * contain) / 2, (canvas.height - bmp.height * contain) / 2,
      bmp.width * contain, bmp.height * contain);
  } else {
    const scale = Math.min(1, 1536 / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", 0.88));
}
