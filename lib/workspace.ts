import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, workspaces, creditLedger } from "@/lib/db";
import { LIMITS } from "@/config/limits";
import { AppError } from "@/lib/errors";

const UUID = /^[0-9a-f-]{36}$/i;

export async function getWorkspace() {
  const id = (await cookies()).get("ws_id")?.value;
  if (!id || !UUID.test(id)) throw new AppError("VALIDATION", "Session missing. Refresh the page.");
  const inserted = await db.insert(workspaces)
    .values({ id, credits: LIMITS.initialCredits })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) {
    await db.insert(creditLedger).values({ workspaceId: id, delta: LIMITS.initialCredits, reason: "initial" });
    return inserted[0];
  }
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return ws;
}
