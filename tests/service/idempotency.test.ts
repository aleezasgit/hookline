import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, workspaces, generations, creditLedger } from "@/lib/db";
import { createGeneration, finalizeGeneration } from "@/lib/generations";
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

describe("idempotency key", () => {
  it("the same key twice resolves to one generation, one charge", async () => {
    const ws = await createTestWorkspace(100);
    const key = crypto.randomUUID();

    const first = await createGeneration(ws, { ...FAST_INPUT, idempotencyKey: key }, { skipCapacity: true });
    const second = await createGeneration(ws, { ...FAST_INPUT, idempotencyKey: key }, { skipCapacity: true });

    expect(second.id).toBe(first.id);

    const rows = await db.select().from(generations).where(eq(generations.idempotencyKey, key));
    expect(rows.length).toBe(1);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(90); // charged once, not twice
    await assertLedgerInvariant(ws.id);
  });

  it("five concurrent requests with the same key still resolve to one generation, one charge", async () => {
    const ws = await createTestWorkspace(100);
    const key = crypto.randomUUID();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => createGeneration(ws, { ...FAST_INPUT, idempotencyKey: key }, { skipCapacity: true })),
    );
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);

    const rows = await db.select().from(generations).where(eq(generations.idempotencyKey, key));
    expect(rows.length).toBe(1);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(90);
    await assertLedgerInvariant(ws.id);
  });
});

describe("partial unique indexes as the last line of defence", () => {
  it("two parallel finalize calls on one draft produce one Pro render, one charge", async () => {
    const ws = await createTestWorkspace(100);
    const draft = await createGeneration(ws, FAST_INPUT, { skipCapacity: true });
    // Skip past the mock provider's run time directly: this test is about the
    // finalize race, not generation completion timing.
    await db.update(generations)
      .set({ status: "done", outputUrl: "/mock/sample-1.mp4", completedAt: new Date() })
      .where(eq(generations.id, draft.id));

    const results = await Promise.all([
      finalizeGeneration(ws, draft.id),
      finalizeGeneration(ws, draft.id),
    ]);
    expect(results[0].id).toBe(results[1].id);

    const finals = await db.select().from(generations)
      .where(and(eq(generations.parentId, draft.id), eq(generations.tier, "final")));
    expect(finals.length).toBe(1);

    const charges = await db.select().from(creditLedger)
      .where(and(eq(creditLedger.workspaceId, ws.id), eq(creditLedger.generationId, finals[0].id)));
    expect(charges.length).toBe(1);
    expect(charges[0].delta).toBe(-25); // pro cost

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(100 - 10 - 25); // draft + one pro render
    await assertLedgerInvariant(ws.id);
  });
});
