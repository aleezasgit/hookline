export type Tier = "draft" | "final";
export type GenStatus = "queued" | "running" | "done" | "failed";
export type ReviewStatus = "none" | "pending" | "done" | "failed";
export type Decision = "pending" | "approved" | "rejected";
export type Aspect = "9:16" | "16:9" | "1:1";
export type Platform = "tiktok" | "reels" | "shorts";
export type Tone = "funny" | "relatable" | "aspirational" | "educational" | "chaotic";
export type Goal = "awareness" | "installs" | "sales" | "engagement";
export type ModelKey = "fast" | "pro";
export type PresetCategory = "camera" | "effects" | "ugc";
export type ConceptsStatus = "idle" | "generating" | "ready" | "failed";

export interface Brief {
  productName: string;
  productDescription: string;
  productImageUrl: string | null;
  audience: string;
  goal: Goal;
  platform: Platform;
  tone: Tone;
  conceptCount: number; // 3..6
}

export interface AiReview {
  scores: { hook: number; native: number; onBrief: number; quality: number };
  reasons: { hook: string; native: string; onBrief: string; quality: string };
  overall: number;
  verdict: "strong" | "okay" | "weak";
  suggestedFix: string;
}

export interface Generation {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  conceptId: string | null;
  parentId: string | null;
  tier: Tier;
  modelKey: ModelKey;
  presetKey: string | null;
  prompt: string;
  composedPrompt: string;
  inputImageUrl: string | null;
  aspect: Aspect;
  duration: number;
  status: GenStatus;
  provider: "fal" | "mock";
  providerEndpoint: string | null;
  providerRequestId: string | null;
  outputUrl: string | null;
  error: string | null;
  cost: number;
  aiReviewStatus: ReviewStatus;
  // NOTE (H2): internal stale-lock bookkeeping, not read by the client. Added so
  // services can access it in a type-safe way instead of casting past lib/types.ts.
  aiReviewStartedAt: string | null;
  aiReview: AiReview | null;
  decision: Decision;
  decisionNote: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  brief: Brief;
  conceptsStatus: ConceptsStatus;
  // NOTE (H2): internal stale-lock bookkeeping, not read by the client. Added so
  // services can access it in a type-safe way instead of casting past lib/types.ts.
  conceptsStartedAt: string | null;
  createdAt: string;
}

export interface Concept {
  id: string;
  campaignId: string;
  position: number;
  hookType: string;
  hookLine: string;
  visualPrompt: string;
  presetKey: string;
  caption: string;
  selected: boolean;
  createdAt: string;
}

export interface ConceptView extends Concept {
  versions: Generation[];      // draft generations, newest first
  latest: Generation | null;   // versions[0]
  final: Generation | null;    // newest tier=final generation for this concept
}

export interface CampaignView {
  campaign: Campaign;
  concepts: ConceptView[];
  counts: { generating: number; needsReview: number; approved: number; rejected: number };
}

export interface CampaignSummary {
  id: string;
  name: string;
  productImageUrl: string | null;
  createdAt: string;
  conceptCount: number;
  approvedCount: number;
}

export type ErrorCode =
  | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "INSUFFICIENT_CREDITS"
  | "TOO_MANY_ACTIVE" | "DAILY_CAP" | "AI_FAILED" | "PROVIDER_FAILED" | "INTERNAL";

export interface ApiErrorBody { error: { code: ErrorCode; message: string } }

export const ACTIVE_STATUSES: GenStatus[] = ["queued", "running"];
export const isActive = (s: GenStatus) => s === "queued" || s === "running";
