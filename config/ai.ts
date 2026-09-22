export const AI = {
  // H4: split across two models so the tight per-minute Groq quota is spread
  // across two independent rate-limit buckets instead of one shared one.
  // gpt-oss-120b rejects reasoning_effort "none" (must be low/medium/high), so
  // it gets its own value; qwen keeps "none" for the fastest possible vision calls.
  textModel: "openai/gpt-oss-120b",
  visionModel: "qwen/qwen3.8-27b",
  textReasoningEffort: "low" as const,
  visionReasoningEffort: "none" as const,
  temperature: { concepts: 0.8, review: 0.2, rewrite: 0.5, enhance: 0.6 },
  // NOTE: this project's Groq account has a tight per-minute output-token quota
  // (observed ~1000 OTPM under load). Requesting more max_completion_tokens than
  // you actually need gets the whole request rejected outright, not truncated, so
  // each call site asks for only as much as its output realistically needs.
  maxTokensByCall: { concepts: 1400, review: 500, rewrite: 400, enhance: 250 },
  rateLimit: {
    perWorkspacePerMinute: 10, // ai_usage rows in the trailing 60s before a call is refused
    maxBackoffMs: 20_000,      // total time spent backing off a 429 before giving up
    callTimeoutMs: 45_000,     // AbortController timeout per Groq request
  },
};
