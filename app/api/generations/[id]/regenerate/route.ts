import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { regenerateGeneration } from "@/lib/generations";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  note: z.string().trim().max(500).optional(),
  includeSuggestion: z.boolean().default(true),
});

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const body = Body.parse(await req.json().catch(() => ({})));
  const generation = await regenerateGeneration(
    ws,
    id,
    body.note ?? null,
    body.includeSuggestion,
    req.headers.get("idempotency-key"),
  );
  return { generation };
});
