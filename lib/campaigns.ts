import "server-only";
import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { db, campaigns, concepts, generations, workspaces } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { generateConcepts } from "@/lib/ai/concepts";
import { composeConceptPrompt } from "@/lib/prompt";
import { createGenerationsBatch, reapStaleReview, refreshMany } from "@/lib/generations";
import { PRESET_KEYS } from "@/config/presets";
import { LIMITS } from "@/config/limits";
import { ACTIVE_STATUSES } from "@/lib/types";
import type { Brief, Campaign, CampaignSummary, CampaignView, Concept, ConceptView, Generation } from "@/lib/types";

type Workspace = typeof workspaces.$inferSelect;

export async function createCampaign(ws: Workspace, brief: Brief): Promise<Campaign> {
  const [row] = await db.insert(campaigns).values({
    workspaceId: ws.id,
    name: brief.productName,
    brief,
  }).returning();
  return row as unknown as Campaign;
}

async function getOwnedCampaign(ws: Workspace, campaignId: string) {
  const [row] = await db.select().from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, ws.id)));
  if (!row) throw new AppError("NOT_FOUND", "Campaign not found.");
  return row;
}

export async function writeConcepts(ws: Workspace, campaignId: string): Promise<CampaignView> {
  const campaign = await getOwnedCampaign(ws, campaignId);

  // H3: rewriting hooks while a batch is actively generating from them would pull
  // the rug out from under those in-flight jobs (they'd keep working off the old
  // visual_prompt while the concept row changes underneath them).
  const activeForCampaign = await db.select().from(generations)
    .where(and(eq(generations.campaignId, campaignId), inArray(generations.status, ACTIVE_STATUSES)));
  if (activeForCampaign.length)
    throw new AppError("CONFLICT", "Videos are generating. Wait for them to finish before rewriting hooks.");

  // H2: hooks "generating" for longer than staleConceptsMs can be reclaimed, so a
  // dead serverless function mid-call never leaves the Hooks step stuck.
  const staleCutoff = new Date(Date.now() - LIMITS.staleConceptsMs);
  const [claimed] = await db.update(campaigns)
    .set({ conceptsStatus: "generating", conceptsStartedAt: new Date() })
    .where(and(
      eq(campaigns.id, campaignId),
      or(
        ne(campaigns.conceptsStatus, "generating"),
        lt(campaigns.conceptsStartedAt, staleCutoff),
      ),
    ))
    .returning();
  if (!claimed) throw new AppError("CONFLICT", "Already writing hooks.");

  try {
    const existing = await db.select().from(concepts).where(eq(concepts.campaignId, campaignId));
    const conceptIds = existing.map((c) => c.id);
    const generationsForConcepts = conceptIds.length
      ? await db.select().from(generations).where(inArray(generations.conceptId, conceptIds))
      : [];
    const lockedIds = new Set(generationsForConcepts.map((g) => g.conceptId));
    const locked = existing.filter((c) => lockedIds.has(c.id));
    const unlocked = existing.filter((c) => !lockedIds.has(c.id));

    const brief = campaign.brief as Brief;
    const count = brief.conceptCount - locked.length;
    const fresh = count > 0
      ? await generateConcepts({ brief, count, avoid: locked.map((c) => c.hookLine), workspaceId: ws.id })
      : [];

    const highestLockedPosition = locked.reduce((max, c) => Math.max(max, c.position), -1);

    await db.transaction(async (tx) => {
      if (unlocked.length) {
        await tx.delete(concepts).where(inArray(concepts.id, unlocked.map((c) => c.id)));
      }
      if (fresh.length) {
        await tx.insert(concepts).values(fresh.map((c, i) => ({
          campaignId,
          position: highestLockedPosition + 1 + i,
          hookType: c.hookType,
          hookLine: c.hookLine,
          visualPrompt: c.visualPrompt,
          presetKey: c.presetKey,
          caption: c.caption,
          selected: true,
        })));
      }
      await tx.update(campaigns).set({ conceptsStatus: "ready" }).where(eq(campaigns.id, campaignId));
    });
  } catch (e) {
    console.error("writeConcepts failed:", e);
    await db.update(campaigns).set({ conceptsStatus: "failed" }).where(eq(campaigns.id, campaignId));
    throw new AppError("AI_FAILED", "Could not write hooks. Try again.");
  }

  return getCampaignView(ws, campaignId);
}

export async function rerollConcept(ws: Workspace, conceptId: string): Promise<Concept> {
  const [concept] = await db.select().from(concepts).where(eq(concepts.id, conceptId));
  if (!concept) throw new AppError("NOT_FOUND", "Concept not found.");
  await getOwnedCampaign(ws, concept.campaignId);

  const [hasGeneration] = await db.select().from(generations).where(eq(generations.conceptId, conceptId));
  if (hasGeneration)
    throw new AppError("CONFLICT", "This hook already has a video. Use Fix and regenerate instead.");

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, concept.campaignId));
  const others = await db.select().from(concepts)
    .where(and(eq(concepts.campaignId, concept.campaignId), ne(concepts.id, conceptId)));

  const [fresh] = await generateConcepts({
    brief: campaign.brief as Brief,
    count: 1,
    avoid: others.map((c) => c.hookLine),
    workspaceId: ws.id,
  });

  const [row] = await db.update(concepts).set({
    hookType: fresh.hookType,
    hookLine: fresh.hookLine,
    visualPrompt: fresh.visualPrompt,
    presetKey: fresh.presetKey,
    caption: fresh.caption,
    selected: true,
  }).where(eq(concepts.id, conceptId)).returning();

  return row as unknown as Concept;
}

export interface ConceptPatch {
  hookLine?: string;
  visualPrompt?: string;
  caption?: string;
  presetKey?: string;
  selected?: boolean;
}

export async function updateConcept(ws: Workspace, conceptId: string, patch: ConceptPatch): Promise<Concept> {
  const [concept] = await db.select().from(concepts).where(eq(concepts.id, conceptId));
  if (!concept) throw new AppError("NOT_FOUND", "Concept not found.");
  await getOwnedCampaign(ws, concept.campaignId);

  if (patch.presetKey !== undefined && !PRESET_KEYS.includes(patch.presetKey))
    throw new AppError("VALIDATION", "Unknown preset.");

  const editsText = patch.hookLine !== undefined || patch.visualPrompt !== undefined
    || patch.caption !== undefined || patch.presetKey !== undefined;
  if (editsText) {
    const [hasGeneration] = await db.select().from(generations).where(eq(generations.conceptId, conceptId));
    if (hasGeneration) throw new AppError("CONFLICT", "This hook already has a video.");
  }

  const [row] = await db.update(concepts).set(patch).where(eq(concepts.id, conceptId)).returning();
  return row as unknown as Concept;
}

export async function generateBatch(ws: Workspace, campaignId: string): Promise<CampaignView> {
  const campaign = await getOwnedCampaign(ws, campaignId);
  // H3: hooks mid-rewrite means concept rows could still change under us.
  if (campaign.conceptsStatus === "generating")
    throw new AppError("CONFLICT", "Hooks are still being written. Wait for them to finish.");
  const allConcepts = await db.select().from(concepts).where(eq(concepts.campaignId, campaignId));
  const withGenerations = new Set(
    (await db.select().from(generations).where(eq(generations.campaignId, campaignId))).map((g) => g.conceptId),
  );
  const targets = allConcepts.filter((c) => c.selected && !withGenerations.has(c.id));
  if (!targets.length) throw new AppError("VALIDATION", "Select at least one hook without a video.");

  const brief = campaign.brief as Brief;
  await createGenerationsBatch(ws, targets.map((c) => ({
    tier: "draft" as const,
    modelKey: "fast" as const,
    presetKey: c.presetKey,
    prompt: c.visualPrompt,
    composedPrompt: composeConceptPrompt(c.presetKey, c.visualPrompt),
    imageUrl: brief.productImageUrl,
    aspect: "9:16" as const,
    duration: 5,
    campaignId,
    conceptId: c.id,
  })));

  return getCampaignView(ws, campaignId);
}

// H2: called while assembling a campaign view. Reports (and persists) hooks that
// have been "generating" longer than staleConceptsMs as "failed", so the Hooks
// step surfaces "Could not write hooks" + "Try again" on its own after a dead
// serverless function, without the user needing to already know to retry it.
async function reapStaleConcepts(campaign: Campaign): Promise<Campaign> {
  if (campaign.conceptsStatus !== "generating" || !campaign.conceptsStartedAt) return campaign;
  const age = Date.now() - new Date(campaign.conceptsStartedAt).getTime();
  if (age < LIMITS.staleConceptsMs) return campaign;
  const [row] = await db.update(campaigns)
    .set({ conceptsStatus: "failed" })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.conceptsStatus, "generating")))
    .returning();
  return (row as unknown as Campaign) ?? campaign;
}

export async function getCampaignView(ws: Workspace, campaignId: string): Promise<CampaignView> {
  const campaignRow = await getOwnedCampaign(ws, campaignId);
  const campaign = await reapStaleConcepts(campaignRow as unknown as Campaign);
  const conceptRows = await db.select().from(concepts)
    .where(eq(concepts.campaignId, campaignId))
    .orderBy(concepts.position);

  const genRows = await db.select().from(generations)
    .where(eq(generations.campaignId, campaignId))
    .orderBy(desc(generations.createdAt));
  const refreshed = await Promise.all((await refreshMany(genRows as unknown as Generation[])).map(reapStaleReview));

  const views: ConceptView[] = conceptRows.map((concept) => {
    const forConcept = refreshed.filter((g) => g.conceptId === concept.id);
    const versions = forConcept.filter((g) => g.tier === "draft");
    const latest = versions[0] ?? null;
    const final = forConcept.filter((g) => g.tier === "final").sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
    return { ...(concept as unknown as Concept), versions, latest, final };
  });

  const counts = views.reduce(
    (acc, v) => {
      if (v.latest) {
        if (v.latest.status === "queued" || v.latest.status === "running") acc.generating++;
        else if (v.latest.status === "done" && v.latest.decision === "approved") acc.approved++;
        else if (v.latest.status === "done" && v.latest.decision === "rejected") acc.rejected++;
        // A failed draft (e.g. timed out) still needs a human to see it and retry,
        // so it counts toward "needs review" the same way the review board's Needs
        // review tab surfaces it (see app/campaigns/[id]/page.tsx's needsReviewTabList).
        else if (v.latest.status === "done" || v.latest.status === "failed") acc.needsReview++;
      }
      return acc;
    },
    { generating: 0, needsReview: 0, approved: 0, rejected: 0 },
  );

  return { campaign, concepts: views, counts };
}

export async function listCampaigns(ws: Workspace): Promise<CampaignSummary[]> {
  const rows = await db.select().from(campaigns)
    .where(eq(campaigns.workspaceId, ws.id))
    .orderBy(desc(campaigns.createdAt));

  const result: CampaignSummary[] = [];
  for (const row of rows) {
    const conceptRows = await db.select().from(concepts).where(eq(concepts.campaignId, row.id));
    const genRows = await db.select().from(generations).where(eq(generations.campaignId, row.id));
    let approvedCount = 0;
    for (const concept of conceptRows) {
      const drafts = genRows
        .filter((g) => g.conceptId === concept.id && g.tier === "draft")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (drafts[0]?.decision === "approved") approvedCount++;
    }
    const brief = row.brief as Brief;
    result.push({
      id: row.id,
      name: row.name,
      productImageUrl: brief.productImageUrl,
      createdAt: row.createdAt as unknown as string,
      conceptCount: conceptRows.length,
      approvedCount,
    });
  }
  return result;
}
