import { z } from "zod";
import { route, AppError } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { reviewGeneration } from "@/lib/generations";
import { LIMITS } from "@/config/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ frames: z.array(z.string()).min(1).max(3) });

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const body = Body.parse(await req.json());
  for (const frame of body.frames) {
    if (!frame.startsWith("data:image/jpeg;base64,"))
      throw new AppError("VALIDATION", "Each frame must be a JPEG data URL.");
    if (frame.length > LIMITS.maxFrameBytes * 1.4)
      throw new AppError("VALIDATION", "A frame is too large.");
  }
  const generation = await reviewGeneration(ws, id, body.frames);
  return { generation };
});
