import { route, AppError } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { uploadProvider } from "@/lib/engine";
import { LIMITS } from "@/config/limits";
import { CLIENT } from "@/config/client";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await getWorkspace();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "No image was uploaded.");
  if (!CLIENT.allowedImageTypes.includes(file.type))
    throw new AppError("VALIDATION", "This image type is not supported. Use a JPG, PNG or WebP.");
  if (file.size > LIMITS.maxUploadBytes)
    throw new AppError("VALIDATION", "Image is too large. Use one under 4 MB.");

  const url = await uploadProvider().upload(file);
  return { url };
});
