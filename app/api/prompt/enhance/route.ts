import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { enhancePrompt } from "@/lib/ai/enhance";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ prompt: z.string().trim().min(1).max(1000), presetKey: z.string().nullable() });

export const POST = route(async (req) => {
  const ws = await getWorkspace();
  const body = Body.parse(await req.json());
  const prompt = await enhancePrompt({ ...body, workspaceId: ws.id });
  return { prompt };
});
