import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { listGenerations } from "@/lib/generations";

export const runtime = "nodejs";

const FILTERS = new Set(["all", "draft", "final", "campaign", "create"]);

export const GET = route(async (req) => {
  const ws = await getWorkspace();
  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter") ?? "all";
  const filter = (FILTERS.has(filterParam) ? filterParam : "all") as
    "all" | "draft" | "final" | "campaign" | "create";
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 60) || 60);

  const generations = await listGenerations(ws, filter, limit);
  return { generations };
});
