import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { createGeneration } from "@/lib/generations";
import { composeCreatePrompt } from "@/lib/prompt";
import { getPreset } from "@/config/presets";
import { getModel } from "@/config/models";

export const runtime = "nodejs";

const Body = z.object({
  presetKey: z.string().nullable(),
  modelKey: z.enum(["fast", "pro"]),
  // Trimmed but not required: an empty prompt is a real path (composeCreatePrompt
  // falls back to the preset's subject or a generic one).
  prompt: z.string().trim().max(1000),
  imageUrl: z.string().nullable(),
  aspect: z.enum(["9:16", "16:9", "1:1"]),
  duration: z.number().int().positive(),
});

export const POST = route(async (req) => {
  const ws = await getWorkspace();
  const body = Body.parse(await req.json());
  const preset = getPreset(body.presetKey);
  const presetKey = preset?.key ?? null;
  const model = getModel(body.modelKey);

  const generation = await createGeneration(ws, {
    tier: model.tier,
    modelKey: body.modelKey,
    presetKey,
    prompt: body.prompt,
    composedPrompt: composeCreatePrompt(presetKey, body.prompt, !!body.imageUrl),
    imageUrl: body.imageUrl,
    aspect: body.aspect,
    duration: body.duration,
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  return { generation };
});
