import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { getOwnedGeneration, refreshGeneration } from "@/lib/generations";

export const runtime = "nodejs";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const generation = await refreshGeneration(await getOwnedGeneration(ws, id));
  return { generation };
});
