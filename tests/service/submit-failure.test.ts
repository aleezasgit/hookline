import { describe, it, expect, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, workspaces } from "@/lib/db";
import { createGeneration } from "@/lib/generations";
import { mockProvider } from "@/lib/engine/mock";
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

afterEach(() => vi.restoreAllMocks());

describe("submit failure", () => {
  it("fails and refunds when the provider's submit throws", async () => {
    // Equivalent to MOCK_SUBMIT_FAIL=1 (config/limits.ts FAULTS), but done with a
    // direct spy since FAULTS is a module-level constant fixed at import time
    // and can't be toggled per test in the same process.
    vi.spyOn(mockProvider, "submit").mockRejectedValueOnce(new Error("Simulated submit failure"));

    const ws = await createTestWorkspace(100);
    const gen = await createGeneration(ws, FAST_INPUT, { skipCapacity: true });

    expect(gen.status).toBe("failed");
    expect(gen.error).toMatch(/could not start the generation/i);
    expect(gen.error).toMatch(/credits refunded/i);

    const [finalWs] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(finalWs.credits).toBe(100);
    await assertLedgerInvariant(ws.id);
  });
});
