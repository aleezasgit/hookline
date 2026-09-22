import { config } from "dotenv";
config({ path: ".env.local" });

// H8: service tests hit the real db module (lib/db/index.ts), which reads
// process.env.DATABASE_URL at import time. Pointing it at the test database
// here, before any app module is imported, means every service function
// transparently talks to the test database with zero test-specific branching
// in the actual app code.
if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST is not set. Add it to .env.local before running tests.");
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.ENGINE_MODE = "mock";
// Next.js augments ProcessEnv with a readonly NODE_ENV type; vitest already
// sets this to "test" itself, so there's nothing to assign here at runtime.
