import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { finalizeGeneration } from "@/lib/generations";

export const runtime = "nodejs";

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const generation = await finalizeGeneration(ws, id, req.headers.get("idempotency-key"));
  return { generation };
});
