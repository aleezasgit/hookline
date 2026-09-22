import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, generations, concepts } from "@/lib/db";
import {
  createGeneration, getOwnedGeneration, finalizeGeneration, retryGeneration, decide,
} from "@/lib/generations";
import { createCampaign, getCampaignView, updateConcept } from "@/lib/campaigns";
import { createTestWorkspace } from "../helpers/db";
import type { Brief } from "@/lib/types";

const FAST_INPUT = {
  tier: "draft" as const,
  modelKey: "fast" as const,
  presetKey: null,
  prompt: "test prompt",
  composedPrompt: "test prompt",
  imageUrl: null,
  aspect: "9:16" as const,
  duration: 5,
};

const BRIEF: Brief = {
  productName: "Test", productDescription: "A test product", productImageUrl: null,
  audience: "Testers", goal: "awareness", platform: "tiktok", tone: "funny", conceptCount: 3,
};

describe("ownership: one workspace can never reach another's objects", () => {
  it("getOwnedGeneration refuses a generation belonging to a different workspace", async () => {
    const owner = await createTestWorkspace(100);
    const intruder = await createTestWorkspace(100);
    const gen = await createGeneration(owner, FAST_INPUT, { skipCapacity: true });

    await expect(getOwnedGeneration(intruder, gen.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getOwnedGeneration(owner, gen.id)).resolves.toMatchObject({ id: gen.id });
  });

  it("finalize, retry and decide all refuse a generation belonging to a different workspace", async () => {
    const owner = await createTestWorkspace(100);
    const intruder = await createTestWorkspace(100);
    const gen = await createGeneration(owner, FAST_INPUT, { skipCapacity: true });
    await db.update(generations)
      .set({ status: "done", outputUrl: "/mock/sample-1.mp4", completedAt: new Date() })
      .where(eq(generations.id, gen.id));

    await expect(finalizeGeneration(intruder, gen.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(decide(intruder, gen.id, "approved")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await db.update(generations).set({ status: "failed" }).where(eq(generations.id, gen.id));
    await expect(retryGeneration(intruder, gen.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a campaign belonging to a different workspace is NOT_FOUND, not another workspace's data", async () => {
    const owner = await createTestWorkspace(100);
    const intruder = await createTestWorkspace(100);
    const campaign = await createCampaign(owner, BRIEF);

    await expect(getCampaignView(intruder, campaign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCampaignView(owner, campaign.id)).resolves.toMatchObject({
      campaign: { id: campaign.id },
    });
  });

  it("updateConcept refuses a concept belonging to a different workspace's campaign", async () => {
    const owner = await createTestWorkspace(100);
    const intruder = await createTestWorkspace(100);
    const campaign = await createCampaign(owner, BRIEF);
    const [concept] = await db.insert(concepts).values({
      campaignId: campaign.id, position: 0, hookType: "problem_first", hookLine: "hook",
      visualPrompt: "a".repeat(40), presetKey: "ugc-handheld", caption: "caption", selected: true,
    }).returning();

    await expect(updateConcept(intruder, concept.id, { caption: "hijacked" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
