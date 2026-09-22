import "server-only";
import { FAULTS } from "@/config/limits";
import type { VideoProvider } from "./types";

// Deterministic fake: queued for 4s, running until 12s, then done.
// A prompt containing "[fail]" fails, so error states can be tested.
// H7: MOCK_SUBMIT_FAIL, MOCK_DELAY_MS and MOCK_FAIL_RATE add more failure
// paths to test for free; see config/limits.ts's FAULTS.
export const mockProvider: VideoProvider = {
  name: "mock",
  async submit({ generationId }) {
    if (FAULTS.mockSubmitFail) throw new Error("Simulated MOCK_SUBMIT_FAIL");
    return { endpoint: "mock", requestId: `mock_${generationId}` };
  },
  async status({ generationId, prompt, createdAt }) {
    const age = Date.now() - createdAt.getTime();
    const totalMs = FAULTS.mockDelayMs ?? 12000;
    const queuedMs = Math.min(4000, totalMs / 3);
    if (age < queuedMs) return { state: "queued" };
    if (age < totalMs) return { state: "running" };
    if (prompt.includes("[fail]")) return { state: "failed", error: "Mock failure for testing." };
    // Deterministic per generation (not re-rolled every poll), so a fault-rate run
    // doesn't flip a clip between "done" and "failed" across successive polls.
    const hash = parseInt(generationId.replace(/-/g, "").slice(0, 6), 16);
    if (FAULTS.mockFailRate > 0 && (hash % 100) / 100 < FAULTS.mockFailRate)
      return { state: "failed", error: "Simulated MOCK_FAIL_RATE failure." };
    const n = (hash % 3) + 1;
    return { state: "done", outputUrl: `/mock/sample-${n}.mp4` };
  },
  async upload(file) {
    // Only used if FAL_KEY is absent. Keeps the app usable offline.
    const buf = Buffer.from(await file.arrayBuffer());
    return `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
  },
};
