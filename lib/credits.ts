import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, workspaces, creditLedger } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function chargeInTx(tx: Tx, workspaceId: string, amount: number, generationId: string) {
  const rows = await tx.update(workspaces)
    .set({ credits: sql`${workspaces.credits} - ${amount}` })
    .where(and(eq(workspaces.id, workspaceId), gte(workspaces.credits, amount)))
    .returning({ credits: workspaces.credits });
  if (!rows.length) throw new AppError("INSUFFICIENT_CREDITS", `Not enough credits. This needs ${amount}.`);
  await tx.insert(creditLedger).values({ workspaceId, delta: -amount, reason: "generation", generationId });
}

export async function refundInTx(tx: Tx, workspaceId: string, amount: number, generationId: string) {
  await tx.update(workspaces)
    .set({ credits: sql`${workspaces.credits} + ${amount}` })
    .where(eq(workspaces.id, workspaceId));
  await tx.insert(creditLedger).values({ workspaceId, delta: amount, reason: "refund", generationId });
}
