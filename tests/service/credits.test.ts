import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, workspaces, creditLedger, generations } from "@/lib/db";
import { createGeneration, refreshGeneration } from "@/lib/generations";
import { createTestWorkspace, assertLedgerInvariant } from "../helpers/db";
import type { Generation } from "@/lib/types";

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

describe("credits under concurrency", () => {
  it("exactly N succeed when credits allow exactly N, balance never goes negative", async () => {
    // 30 credits = exactly 3 fast generations (10 each). skipCapacity isolates
    // the credits mechanism from the separate active-generation cap, which this
    // test isn't about.
    const ws = await createTestWorkspace(30);
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => createGeneration(ws, FAST_INPUT, { skipCapacity: true })),
    );
    const succeeded = attempts.filter((r) => r.status === "fulfilled");
    const rejected = attempts.filter((r) => r.status === "rejected");
    expect(succeeded.length).toBe(3);
    expect(rejected.length).toBe(7);
    for (const r of rejected as PromiseRejectedResult[]) {
      expect(String(r.reason?.message ?? r.reason)).toMatch(/credits/i);
    }

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(0);
    expect(finalWs.credits).toBeGreaterThanOrEqual(0);
    await assertLedgerInvariant(ws.id);
  });

  it("a failing generation polled many times in parallel refunds exactly once", async () => {
    const ws = await createTestWorkspace(100);
    const gen = await createGeneration(ws, FAST_INPUT, { skipCapacity: true });

    // Backdate past the 10 minute timeout so refreshGeneration sees it as stale.
    await db.update(generations)
      .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(generations.id, gen.id));
    const [staleRow] = await db.select().from(generations).where(eq(generations.id, gen.id));
    const staleGen = staleRow as unknown as Generation;

    await Promise.all(Array.from({ length: 20 }, () => refreshGeneration(staleGen)));

    const [finalRow] = await db.select().from(generations).where(eq(generations.id, gen.id));
    expect(finalRow.status).toBe("failed");

    const refunds = await db.select().from(creditLedger)
      .where(and(eq(creditLedger.workspaceId, ws.id), eq(creditLedger.reason, "refund")));
    expect(refunds.length).toBe(1);
    await assertLedgerInvariant(ws.id);
  });

  it("times out and refunds a generation created 11 minutes ago", async () => {
    const ws = await createTestWorkspace(100);
    const gen = await createGeneration(ws, FAST_INPUT, { skipCapacity: true });
    await db.update(generations)
      .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(generations.id, gen.id));
    const [staleRow] = await db.select().from(generations).where(eq(generations.id, gen.id));

    const refreshed = await refreshGeneration(staleRow as unknown as Generation);
    expect(refreshed.status).toBe("failed");
    expect(refreshed.error).toMatch(/timed out/i);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(100); // fully refunded
    await assertLedgerInvariant(ws.id);
  });
});
