export const LIMITS = {
  initialCredits: Number(process.env.INITIAL_CREDITS ?? 300),
  maxActivePerWorkspace: 8,
  maxDailyGenerations: Math.min(60, Number(process.env.MAX_DAILY_GENERATIONS ?? 60)),
  generationTimeoutMs: 10 * 60 * 1000,
  submitGraceMs: 2 * 60 * 1000,       // queued with no request id for longer than this = failed
  staleReviewMs: 2 * 60 * 1000,       // ai review pending longer than this = stale, can be reclaimed
  staleConceptsMs: 2 * 60 * 1000,     // hooks generating longer than this = stale, can be reclaimed
  pollMs: 3000,
  maxUploadBytes: 4 * 1024 * 1024,
  maxFrameBytes: 400 * 1024,
  mediaHostSuffixes: ["fal.media", "fal.ai", "fal.run"], // extend if outputs come from another host
};

// H7: development-only fault switches so every failure path can be tested for
// free, without waiting for a real timeout or spending real fal/Groq money. Read
// only outside production so a stray env var can never affect real reviewers.
export const FAULTS = process.env.NODE_ENV === "production" ? {
  mockFailRate: 0,
  mockSubmitFail: false,
  mockDelayMs: null as number | null,
  aiFault: undefined as "rate_limit" | "bad_json" | "timeout" | "down" | undefined,
} : {
  mockFailRate: Math.min(1, Math.max(0, Number(process.env.MOCK_FAIL_RATE ?? 0))),
  mockSubmitFail: process.env.MOCK_SUBMIT_FAIL === "1",
  mockDelayMs: process.env.MOCK_DELAY_MS ? Number(process.env.MOCK_DELAY_MS) : null,
  aiFault: (["rate_limit", "bad_json", "timeout", "down"] as const).includes(process.env.AI_FAULT as never)
    ? (process.env.AI_FAULT as "rate_limit" | "bad_json" | "timeout" | "down")
    : undefined,
};
