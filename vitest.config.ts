import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/shims/server-only.ts"),
      "@": __dirname,
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/service/**/*.test.ts"],
    // Service tests share one real Postgres database and lean on unique ids
    // (fresh workspace/campaign/generation rows per test) for isolation rather
    // than transactional rollback, so running test FILES one at a time avoids
    // any cross-file ordering surprises. Tests within a file that need true
    // concurrency (Promise.all of many requests) still get it; this only
    // serializes the files themselves.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
