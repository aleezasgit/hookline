import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { getCampaignView } from "@/lib/campaigns";

export const runtime = "nodejs";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  return getCampaignView(ws, id);
});
