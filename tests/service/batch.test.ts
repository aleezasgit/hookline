import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, workspaces, generations } from "@/lib/db";
import { createGenerationsBatch } from "@/lib/generations";
import { createTestWorkspace, assertLedgerInvariant } from "../helpers/db";

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

describe("batch generation is all-or-nothing", () => {
  it("a batch of 4 with credits for only 3 creates and charges nothing", async () => {
    const ws = await createTestWorkspace(30); // exactly 3 fast generations
    await expect(
      createGenerationsBatch(ws, [FAST_INPUT, FAST_INPUT, FAST_INPUT, FAST_INPUT]),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    const rows = await db.select().from(generations).where(eq(generations.workspaceId, ws.id));
    expect(rows.length).toBe(0);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(30);
    await assertLedgerInvariant(ws.id);
  });

  it("a batch that fits fully succeeds and charges exactly the batch total", async () => {
    const ws = await createTestWorkspace(30);
    const results = await createGenerationsBatch(ws, [FAST_INPUT, FAST_INPUT, FAST_INPUT]);
    expect(results.length).toBe(3);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(0);
    await assertLedgerInvariant(ws.id);
  });
});
