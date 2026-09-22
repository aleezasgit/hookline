import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { rerollConcept } from "@/lib/campaigns";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const concept = await rerollConcept(ws, id);
  return { concept };
});
