import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ws = await getWorkspace();
  return { id: ws.id, credits: ws.credits };
});
