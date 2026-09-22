import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, campaigns, concepts, generations, workspaces } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { chargeInTx, refundInTx } from "@/lib/credits";
import { engineMode, getProvider } from "@/lib/engine";
import { getModel } from "@/config/models";
import { LIMITS } from "@/config/limits";
import { composeConceptPrompt } from "@/lib/prompt";
import { rewritePrompt } from "@/lib/ai/rewrite";
import { reviewClip } from "@/lib/ai/review";
import { ACTIVE_STATUSES, isActive } from "@/lib/types";
import type { Aspect, Brief, Concept, Decision, Generation, ModelKey, Tier } from "@/lib/types";

type Workspace = typeof workspaces.$inferSelect;
type GenerationFilter = "all" | "draft" | "final" | "campaign" | "create";

export interface CreateGenInput {
  tier: Tier;
  modelKey: ModelKey;
  presetKey: string | null;
  prompt: string;
  composedPrompt: string;
  imageUrl: string | null;
  aspect: Aspect;
  duration: number;
  campaignId?: string | null;
  conceptId?: string | null;
  parentId?: string | null;
  idempotencyKey?: string | null;
}

function isUniqueViolation(e: unknown): boolean {
  // Drizzle wraps the underlying postgres.js error (which has .code = '23505') in
  // its own error object, with the original on .cause, so both need checking.
  if (!e || typeof e !== "object") return false;
  if ((e as { code?: string }).code === "23505") return true;
  const cause = (e as { cause?: unknown }).cause;
  return !!cause && typeof cause === "object" && (cause as { code?: string }).code === "23505";
}

// H3: after createGeneration's insert loses a unique-index race (the client's own
// idempotency key repeated, or the "one live version per concept/parent" indexes),
// find and return whichever row actually won instead of erroring. Checked in this
// order because a given call only ever matches one of these shapes.
async function findDuplicateGeneration(workspaceId: string, input: CreateGenInput): Promise<Generation | null> {
  if (input.idempotencyKey) {
    const [row] = await db.select().from(generations)
      .where(and(eq(generations.workspaceId, workspaceId), eq(generations.idempotencyKey, input.idempotencyKey)));
    if (row) return row as unknown as Generation;
  }
  if (input.conceptId && input.tier === "draft" && !input.parentId) {
    const [row] = await db.select().from(generations)
      .where(and(
        eq(generations.conceptId, input.conceptId),
        eq(generations.tier, "draft"),
        isNull(generations.parentId),
        ne(generations.status, "failed"),
      ));
    if (row) return row as unknown as Generation;
  }
  if (input.parentId) {
    const [row] = await db.select().from(generations)
      .where(and(
        eq(generations.parentId, input.parentId),
        eq(generations.tier, input.tier),
        ne(generations.status, "failed"),
      ));
    if (row) return row as unknown as Generation;
  }
  return null;
}

export async function assertCapacity(workspaceId: string, n: number) {
  const active = await db.select().from(generations)
    .where(and(eq(generations.workspaceId, workspaceId), inArray(generations.status, ACTIVE_STATUSES)));
  if (active.length + n > LIMITS.maxActivePerWorkspace)
    throw new AppError("TOO_MANY_ACTIVE", `You have ${active.length} videos generating. Wait for a few to finish.`);

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const today = await db.select().from(generations).where(gte(generations.createdAt, midnight));
  if (today.length + n > LIMITS.maxDailyGenerations)
    throw new AppError("DAILY_CAP", "The demo reached today's generation limit. Try again tomorrow.");
}

export async function createGeneration(
  ws: Workspace,
  input: CreateGenInput,
  opts?: { skipCapacity?: boolean },
): Promise<Generation> {
  const model = getModel(input.modelKey);
  if (!model.aspects.includes(input.aspect))
    throw new AppError("VALIDATION", "That aspect ratio is not supported for this model.");
  if (!model.durations.includes(input.duration))
    throw new AppError("VALIDATION", "That length is not supported for this model.");

  if (!opts?.skipCapacity) await assertCapacity(ws.id, 1);

  let gen: Generation;
  try {
    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(generations).values({
        workspaceId: ws.id,
        campaignId: input.campaignId ?? null,
        conceptId: input.conceptId ?? null,
        parentId: input.parentId ?? null,
        tier: input.tier,
        modelKey: input.modelKey,
        presetKey: input.presetKey,
        prompt: input.prompt,
        composedPrompt: input.composedPrompt,
        inputImageUrl: input.imageUrl,
        aspect: input.aspect,
        duration: input.duration,
        status: "queued",
        provider: engineMode(),
        cost: model.costCredits,
        idempotencyKey: input.idempotencyKey ?? null,
      }).returning();
      await chargeInTx(tx, ws.id, model.costCredits, inserted.id);
      return inserted;
    });
    gen = row as unknown as Generation;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Nothing was charged: the insert itself failed, before chargeInTx ran.
    const existing = await findDuplicateGeneration(ws.id, input);
    if (!existing) throw new AppError("CONFLICT", "This generation already exists. Refresh and try again.");
    return existing; // the request that actually won this race handles submission
  }

  try {
    const provider = getProvider(gen.provider as "fal" | "mock");
    const { endpoint, requestId } = await provider.submit({
      generationId: gen.id,
      modelKey: input.modelKey,
      prompt: gen.composedPrompt,
      imageUrl: input.imageUrl,
      aspect: input.aspect,
      duration: input.duration,
    });
    const [updated] = await db.update(generations)
      .set({ providerEndpoint: endpoint, providerRequestId: requestId })
      .where(eq(generations.id, gen.id))
      .returning();
    return updated as unknown as Generation;
  } catch {
    return failGeneration(gen.id, "Could not start the generation. Credits refunded.");
  }
}

export async function createGenerationsBatch(ws: Workspace, inputs: CreateGenInput[]): Promise<Generation[]> {
  await assertCapacity(ws.id, inputs.length);
  const total = inputs.reduce((sum, i) => sum + getModel(i.modelKey).costCredits, 0);
  if (ws.credits < total)
    throw new AppError("INSUFFICIENT_CREDITS", `Not enough credits. This batch needs ${total}.`);
  return Promise.all(inputs.map((i) => createGeneration(ws, i, { skipCapacity: true })));
}

export async function failGeneration(id: string, error: string): Promise<Generation> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(generations)
      .set({ status: "failed", error, completedAt: new Date() })
      .where(and(eq(generations.id, id), inArray(generations.status, ["queued", "running"])))
      .returning();
    if (row) {
      if (row.cost > 0) await refundInTx(tx, row.workspaceId, row.cost, row.id);
      return row as unknown as Generation;
    }
    const [existing] = await tx.select().from(generations).where(eq(generations.id, id));
    return existing as unknown as Generation;
  });
}

export async function refreshGeneration(gen: Generation): Promise<Generation> {
  if (!isActive(gen.status)) return gen;

  const createdAt = new Date(gen.createdAt);
  const age = Date.now() - createdAt.getTime();
  if (age > LIMITS.generationTimeoutMs)
    return failGeneration(gen.id, "Timed out after 10 minutes. Credits refunded.");

  if (!gen.providerRequestId) {
    if (age > LIMITS.submitGraceMs)
      return failGeneration(gen.id, "Could not start the generation. Credits refunded.");
    return gen;
  }

  const provider = getProvider(gen.provider);
  let s;
  try {
    s = await provider.status({
      generationId: gen.id,
      endpoint: gen.providerEndpoint!,
      requestId: gen.providerRequestId,
      modelKey: gen.modelKey,
      prompt: gen.composedPrompt,
      createdAt,
    });
  } catch {
    return gen;
  }

  if (s.state === "running") {
    if (gen.status !== "queued") return gen;
    const [row] = await db.update(generations)
      .set({ status: "running" })
      .where(and(eq(generations.id, gen.id), eq(generations.status, "queued")))
      .returning();
    return (row as unknown as Generation) ?? gen;
  }

  if (s.state === "done") {
    const [row] = await db.update(generations)
      .set({ status: "done", outputUrl: s.outputUrl, completedAt: new Date() })
      .where(and(eq(generations.id, gen.id), inArray(generations.status, ACTIVE_STATUSES)))
      .returning();
    if (row) return row as unknown as Generation;
    const [fresh] = await db.select().from(generations).where(eq(generations.id, gen.id));
    return fresh as unknown as Generation;
  }

  if (s.state === "failed") return failGeneration(gen.id, s.error);

  return gen; // still queued
}

export async function refreshMany(gens: Generation[]): Promise<Generation[]> {
  const active = gens.filter((g) => isActive(g.status));
  if (!active.length) return gens;
  const refreshed = await Promise.all(active.map(refreshGeneration));
  const map = new Map(refreshed.map((g) => [g.id, g]));
  return gens.map((g) => map.get(g.id) ?? g);
}

export async function getOwnedGeneration(ws: Workspace, id: string): Promise<Generation> {
  const [row] = await db.select().from(generations)
    .where(and(eq(generations.id, id), eq(generations.workspaceId, ws.id)));
  if (!row) throw new AppError("NOT_FOUND", "Video not found.");
  return row as unknown as Generation;
}

export async function listGenerations(
  ws: Workspace,
  filter: GenerationFilter,
  limit: number,
): Promise<Generation[]> {
  const conditions = [eq(generations.workspaceId, ws.id)];
  if (filter === "draft") conditions.push(eq(generations.tier, "draft"));
  if (filter === "final") conditions.push(eq(generations.tier, "final"));
  if (filter === "campaign") conditions.push(isNotNull(generations.campaignId));
  if (filter === "create") conditions.push(isNull(generations.campaignId));

  const rows = await db.select().from(generations)
    .where(and(...conditions))
    .orderBy(desc(generations.createdAt))
    .limit(limit);
  return refreshMany(rows as unknown as Generation[]);
}

export async function retryGeneration(ws: Workspace, id: string, idempotencyKey?: string | null): Promise<Generation> {
  const gen = await getOwnedGeneration(ws, id);
  if (gen.status !== "failed") throw new AppError("CONFLICT", "Only failed generations can be retried.");
  return createGeneration(ws, {
    tier: gen.tier,
    modelKey: gen.modelKey,
    presetKey: gen.presetKey,
    prompt: gen.prompt,
    composedPrompt: gen.composedPrompt,
    imageUrl: gen.inputImageUrl,
    aspect: gen.aspect,
    duration: gen.duration,
    campaignId: gen.campaignId,
    conceptId: gen.conceptId,
    parentId: gen.parentId,
    idempotencyKey,
  });
}

export async function finalizeGeneration(ws: Workspace, id: string, idempotencyKey?: string | null): Promise<Generation> {
  const gen = await getOwnedGeneration(ws, id);
  if (gen.status !== "done" || gen.tier !== "draft")
    throw new AppError("CONFLICT", "Only finished drafts can be rendered in Pro.");

  const proModel = getModel("pro");
  const existingFinals = await db.select().from(generations)
    .where(and(eq(generations.parentId, gen.id), eq(generations.tier, "final")));
  if (existingFinals.some((g) => g.status !== "failed"))
    throw new AppError("CONFLICT", "A Pro render already exists.");

  const duration = proModel.durations.includes(gen.duration) ? gen.duration : proModel.defaultDuration;

  return createGeneration(ws, {
    tier: "final",
    modelKey: "pro",
    presetKey: gen.presetKey,
    prompt: gen.prompt,
    composedPrompt: gen.composedPrompt,
    imageUrl: gen.inputImageUrl,
    aspect: gen.aspect,
    duration,
    campaignId: gen.campaignId,
    conceptId: gen.conceptId,
    parentId: gen.id,
    idempotencyKey,
  });
}

export async function regenerateGeneration(
  ws: Workspace,
  id: string,
  note?: string | null,
  includeSuggestion = true,
  idempotencyKey?: string | null,
): Promise<Generation> {
  const gen = await getOwnedGeneration(ws, id);
  if (!gen.campaignId || !gen.conceptId || gen.tier !== "draft" || !(gen.status === "done" || gen.status === "failed"))
    throw new AppError("CONFLICT", "Only a finished or failed campaign draft can be regenerated.");

  const [concept] = await db.select().from(concepts).where(eq(concepts.id, gen.conceptId));
  if (!concept) throw new AppError("NOT_FOUND", "Concept not found.");
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, gen.campaignId));
  if (!campaign) throw new AppError("NOT_FOUND", "Campaign not found.");

  const aiFix = includeSuggestion ? (gen.aiReview?.suggestedFix ?? null) : null;

  const newPrompt = await rewritePrompt({
    original: gen.prompt,
    humanNote: note ?? null,
    aiFix,
    brief: campaign.brief as Brief,
    workspaceId: ws.id,
  });

  await db.update(concepts).set({ visualPrompt: newPrompt }).where(eq(concepts.id, concept.id));

  return createGeneration(ws, {
    tier: "draft",
    modelKey: gen.modelKey,
    presetKey: concept.presetKey,
    prompt: newPrompt,
    composedPrompt: composeConceptPrompt(concept.presetKey, newPrompt),
    imageUrl: gen.inputImageUrl,
    aspect: gen.aspect,
    duration: gen.duration,
    campaignId: gen.campaignId,
    conceptId: gen.conceptId,
    parentId: gen.id,
    idempotencyKey,
  });
}

export async function decide(ws: Workspace, id: string, decision: Decision, note?: string | null): Promise<Generation> {
  const gen = await getOwnedGeneration(ws, id);
  if (gen.status !== "done") throw new AppError("CONFLICT", "Only finished videos can be reviewed.");
  const [row] = await db.update(generations)
    .set({ decision, decisionNote: note ?? null })
    .where(eq(generations.id, id))
    .returning();
  return row as unknown as Generation;
}

export async function reviewGeneration(ws: Workspace, id: string, frames: string[]): Promise<Generation> {
  const gen = await getOwnedGeneration(ws, id);
  if (gen.status !== "done" || !gen.campaignId || !gen.conceptId)
    throw new AppError("VALIDATION", "Only finished campaign clips can be reviewed.");

  // H2: a "pending" review can be reclaimed once it's older than staleReviewMs, so a
  // tab closing (or a serverless function dying) mid-review never leaves it stuck.
  const staleCutoff = new Date(Date.now() - LIMITS.staleReviewMs);
  const [claimed] = await db.update(generations)
    .set({ aiReviewStatus: "pending", aiReviewStartedAt: new Date() })
    .where(and(
      eq(generations.id, id),
      or(
        inArray(generations.aiReviewStatus, ["none", "failed"]),
        and(eq(generations.aiReviewStatus, "pending"), lt(generations.aiReviewStartedAt, staleCutoff)),
      ),
    ))
    .returning();
  if (!claimed) throw new AppError("CONFLICT", "Review already running.");

  const [concept] = await db.select().from(concepts).where(eq(concepts.id, gen.conceptId));
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, gen.campaignId));
  if (!concept || !campaign) throw new AppError("NOT_FOUND", "Concept not found.");

  try {
    const review = await reviewClip({
      frames,
      brief: campaign.brief as Brief,
      concept: concept as unknown as Concept,
      workspaceId: ws.id,
    });
    const [row] = await db.update(generations)
      .set({ aiReviewStatus: "done", aiReview: review })
      .where(eq(generations.id, id))
      .returning();
    return row as unknown as Generation;
  } catch (e) {
    console.error("reviewGeneration failed:", e);
    await db.update(generations).set({ aiReviewStatus: "failed" }).where(eq(generations.id, id));
    throw new AppError("AI_FAILED", "The review could not be completed. Try again.");
  }
}

// H2: called while assembling a campaign view. Reports (and persists) a review that
// has been "pending" longer than staleReviewMs as "failed", so a card that got
// orphaned by a closed tab or a dead serverless function surfaces "Retry review"
// on its own, without the user needing to already know to retry it.
export async function reapStaleReview(gen: Generation): Promise<Generation> {
  if (gen.aiReviewStatus !== "pending" || !gen.aiReviewStartedAt) return gen;
  const age = Date.now() - new Date(gen.aiReviewStartedAt).getTime();
  if (age < LIMITS.staleReviewMs) return gen;
  const [row] = await db.update(generations)
    .set({ aiReviewStatus: "failed" })
    .where(and(eq(generations.id, gen.id), eq(generations.aiReviewStatus, "pending")))
    .returning();
  return (row as unknown as Generation) ?? gen;
}
