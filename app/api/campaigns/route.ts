import { z } from "zod";
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { createCampaign, listCampaigns } from "@/lib/campaigns";

export const runtime = "nodejs";

const BriefSchema = z.object({
  productName: z.string().trim().min(1).max(80),
  productDescription: z.string().trim().min(1).max(300),
  productImageUrl: z.string().nullable(),
  audience: z.string().trim().min(1).max(200),
  goal: z.enum(["awareness", "installs", "sales", "engagement"]),
  platform: z.enum(["tiktok", "reels", "shorts"]),
  tone: z.enum(["funny", "relatable", "aspirational", "educational", "chaotic"]),
  conceptCount: z.number().int().min(3).max(6),
});
const Body = z.object({ brief: BriefSchema });

export const GET = route(async () => {
  const ws = await getWorkspace();
  const campaigns = await listCampaigns(ws);
  return { campaigns };
});

export const POST = route(async (req) => {
  const ws = await getWorkspace();
  const body = Body.parse(await req.json());
  const campaign = await createCampaign(ws, body.brief);
  return { campaign };
});
