import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, workspaces, creditLedger } from "@/lib/db";
import { expect } from "vitest";

// H8: each test gets its own workspace with a fresh random id, so many tests
// (even concurrent ones) can share one real database without truncating
// between them or stepping on each other's data. Mirrors getWorkspace()
// (lib/workspace.ts): the starting balance is itself an "initial" ledger row,
// not just a number set on the row, so assertLedgerInvariant holds from the start.
export async function createTestWorkspace(credits = 300) {
  const [ws] = await db.insert(workspaces).values({ id: randomUUID(), credits }).returning();
  await db.insert(creditLedger).values({ workspaceId: ws.id, delta: credits, reason: "initial" });
  return ws;
}

// H8: "after every test, workspace.credits equals the sum of its ledger
// deltas." Every credits/generations test ends with this.
export async function assertLedgerInvariant(workspaceId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const rows = await db.select().from(creditLedger).where(eq(creditLedger.workspaceId, workspaceId));
  const sum = rows.reduce((acc, r) => acc + r.delta, 0);
  expect(ws.credits).toBe(sum);
}
