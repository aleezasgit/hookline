import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { updateConcept } from "@/lib/campaigns";

export const runtime = "nodejs";

const Body = z.object({
  hookLine: z.string().trim().min(3).max(120).optional(),
  visualPrompt: z.string().trim().min(20).max(800).optional(),
  caption: z.string().trim().min(1).max(300).optional(),
  presetKey: z.string().optional(),
  selected: z.boolean().optional(),
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const patch = Body.parse(await req.json());
  const concept = await updateConcept(ws, id, patch);
  return { concept };
});
