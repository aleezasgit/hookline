import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { retryGeneration } from "@/lib/generations";

export const runtime = "nodejs";

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const generation = await retryGeneration(ws, id, req.headers.get("idempotency-key"));
  return { generation };
});
