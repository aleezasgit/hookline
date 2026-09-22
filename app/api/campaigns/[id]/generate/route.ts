import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { generateBatch } from "@/lib/campaigns";

export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  return generateBatch(ws, id);
});
