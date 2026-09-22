import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { decide } from "@/lib/generations";

export const runtime = "nodejs";

const Body = z.object({
  decision: z.enum(["pending", "approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const body = Body.parse(await req.json());
  const generation = await decide(ws, id, body.decision, body.note ?? null);
  return { generation };
});
