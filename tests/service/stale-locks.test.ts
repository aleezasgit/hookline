import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, campaigns, concepts, generations } from "@/lib/db";
import { writeConcepts } from "@/lib/campaigns";
import { reviewGeneration, createGeneration } from "@/lib/generations";
import { createTestWorkspace } from "../helpers/db";
import type { Brief } from "@/lib/types";

// H8: never call Groq from tests. Both AI entry points writeConcepts and
// reviewGeneration touch are mocked at their module boundary.
vi.mock("@/lib/ai/concepts", () => ({
  generateConcepts: vi.fn().mockResolvedValue([
    { hookType: "problem_first", hookLine: "test hook", visualPrompt: "a".repeat(40), presetKey: "ugc-handheld", caption: "test caption" },
  ]),
}));
vi.mock("@/lib/ai/review", () => ({
  reviewClip: vi.fn().mockResolvedValue({
    scores: { hook: 4, native: 4, onBrief: 4, quality: 4 },
    reasons: { hook: "x", native: "x", onBrief: "x", quality: "x" },
    overall: 4,
    verdict: "strong",
    suggestedFix: "test fix",
  }),
}));

const BRIEF: Brief = {
  productName: "Test",
  productDescription: "A test product",
  productImageUrl: null,
  audience: "Testers",
  goal: "awareness",
  platform: "tiktok",
  tone: "funny",
  conceptCount: 3,
};

describe("stale locks can be reclaimed", () => {
  it("hooks generating for 3 minutes can be rewritten", async () => {
    const ws = await createTestWorkspace(300);
    const [campaign] = await db.insert(campaigns).values({
      workspaceId: ws.id,
      name: BRIEF.productName,
      brief: BRIEF,
      conceptsStatus: "generating",
      conceptsStartedAt: new Date(Date.now() - 3 * 60 * 1000),
    }).returning();

    const view = await writeConcepts(ws, campaign.id);
    expect(view.campaign.conceptsStatus).toBe("ready");
  });

  it("a review pending for 3 minutes can be retried", async () => {
    const ws = await createTestWorkspace(300);
    const [campaign] = await db.insert(campaigns).values({
      workspaceId: ws.id, name: BRIEF.productName, brief: BRIEF, conceptsStatus: "ready",
    }).returning();
    const [concept] = await db.insert(concepts).values({
      campaignId: campaign.id, position: 0, hookType: "problem_first", hookLine: "hook",
      visualPrompt: "a".repeat(40), presetKey: "ugc-handheld", caption: "caption", selected: true,
    }).returning();
    const gen = await createGeneration(ws, {
      tier: "draft", modelKey: "fast", presetKey: "ugc-handheld",
      prompt: "test", composedPrompt: "test", imageUrl: null, aspect: "9:16", duration: 5,
      campaignId: campaign.id, conceptId: concept.id,
    }, { skipCapacity: true });
    await db.update(generations).set({
      status: "done", outputUrl: "/mock/sample-1.mp4", completedAt: new Date(),
      aiReviewStatus: "pending", aiReviewStartedAt: new Date(Date.now() - 3 * 60 * 1000),
    }).where(eq(generations.id, gen.id));

    const result = await reviewGeneration(ws, gen.id, ["data:image/jpeg;base64,AAAA"]);
    expect(result.aiReviewStatus).toBe("done");
    expect(result.aiReview?.overall).toBe(4);
  });

  it("a review still genuinely pending (not stale) refuses a second claim", async () => {
    const ws = await createTestWorkspace(300);
    const [campaign] = await db.insert(campaigns).values({
      workspaceId: ws.id, name: BRIEF.productName, brief: BRIEF, conceptsStatus: "ready",
    }).returning();
    const [concept] = await db.insert(concepts).values({
      campaignId: campaign.id, position: 0, hookType: "problem_first", hookLine: "hook",
      visualPrompt: "a".repeat(40), presetKey: "ugc-handheld", caption: "caption", selected: true,
    }).returning();
    const gen = await createGeneration(ws, {
      tier: "draft", modelKey: "fast", presetKey: "ugc-handheld",
      prompt: "test", composedPrompt: "test", imageUrl: null, aspect: "9:16", duration: 5,
      campaignId: campaign.id, conceptId: concept.id,
    }, { skipCapacity: true });
    await db.update(generations).set({
      status: "done", outputUrl: "/mock/sample-1.mp4", completedAt: new Date(),
      aiReviewStatus: "pending", aiReviewStartedAt: new Date(), // fresh, not stale
    }).where(eq(generations.id, gen.id));

    await expect(reviewGeneration(ws, gen.id, ["data:image/jpeg;base64,AAAA"]))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });
});
