import { config } from "dotenv";
config({ path: ".env.local" });
import { execSync } from "node:child_process";
import postgres from "postgres";

// H8: runs once before the whole vitest suite (not per test file). Pushes the
// schema to DATABASE_URL_TEST, then truncates every table so a previous run's
// leftovers (or a run that crashed mid-way) never bleed into this one.
export default async function globalSetup() {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error("DATABASE_URL_TEST is not set. Add it to .env.local before running tests.");
  }
  execSync("npx drizzle-kit push --config drizzle.test.config.ts --force", {
    stdio: "inherit",
    env: process.env,
  });

  const sql = postgres(process.env.DATABASE_URL_TEST, { prepare: false, max: 1 });
  await sql`TRUNCATE TABLE credit_ledger, ai_usage, generations, concepts, campaigns, workspaces RESTART IDENTITY CASCADE`;
  await sql.end();
}
