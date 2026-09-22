import { pgTable, uuid, text, integer, jsonb, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AiReview, Brief } from "@/lib/types";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  credits: integer("credits").notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  brief: jsonb("brief").$type<Brief>().notNull(),
  conceptsStatus: text("concepts_status").notNull().default("idle"),
  conceptsStartedAt: ts("concepts_started_at"), // set when entering "generating", for stale-lock takeover (H2)
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [index("campaigns_ws_idx").on(t.workspaceId)]);

export const concepts = pgTable("concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  hookType: text("hook_type").notNull(),
  hookLine: text("hook_line").notNull(),
  visualPrompt: text("visual_prompt").notNull(),
  presetKey: text("preset_key").notNull(),
  caption: text("caption").notNull(),
  selected: boolean("selected").notNull().default(true),
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [index("concepts_campaign_idx").on(t.campaignId)]);

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  conceptId: uuid("concept_id").references(() => concepts.id),
  parentId: uuid("parent_id"),
  tier: text("tier").notNull(),
  modelKey: text("model_key").notNull(),
  presetKey: text("preset_key"),
  prompt: text("prompt").notNull(),
  composedPrompt: text("composed_prompt").notNull(),
  inputImageUrl: text("input_image_url"),
  aspect: text("aspect").notNull(),
  duration: integer("duration").notNull(),
  status: text("status").notNull().default("queued"),
  provider: text("provider").notNull(),
  providerEndpoint: text("provider_endpoint"),
  providerRequestId: text("provider_request_id"),
  outputUrl: text("output_url"),
  error: text("error"),
  cost: integer("cost").notNull(),
  aiReviewStatus: text("ai_review_status").notNull().default("none"),
  aiReviewStartedAt: ts("ai_review_started_at"), // set when entering "pending", for stale-lock takeover (H2)
  aiReview: jsonb("ai_review").$type<AiReview>(),
  decision: text("decision").notNull().default("pending"),
  decisionNote: text("decision_note"),
  // H3: a client-supplied key, one per button click, so a duplicate request (a
  // network retry, or a click that slips past the button's own disabled state)
  // resolves to the same row instead of creating and charging a second one.
  idempotencyKey: text("idempotency_key"),
  createdAt: ts("created_at").defaultNow().notNull(),
  completedAt: ts("completed_at"),
}, (t) => [
  index("gen_ws_idx").on(t.workspaceId, t.createdAt),
  index("gen_campaign_idx").on(t.campaignId),
  index("gen_status_idx").on(t.status),
  // A plain (non-partial) unique index: Postgres never treats two NULLs as equal,
  // so rows without a key (e.g. batch-created drafts) never collide with each
  // other, only genuinely repeated keys within the same workspace do.
  uniqueIndex("gen_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
  // H3 last line of defence: at most one live (non-failed) first draft per concept...
  uniqueIndex("gen_concept_first_draft_unique").on(t.conceptId)
    .where(sql`${t.tier} = 'draft' AND ${t.parentId} IS NULL AND ${t.status} <> 'failed'`),
  // ...and at most one live (non-failed) child of a given tier per parent (a Pro
  // render or a fix-and-regenerate version), regardless of what created it.
  uniqueIndex("gen_parent_tier_unique").on(t.parentId, t.tier)
    .where(sql`${t.parentId} IS NOT NULL AND ${t.status} <> 'failed'`),
]);

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  generationId: uuid("generation_id"),
  createdAt: ts("created_at").defaultNow().notNull(),
});

// H4: one row per Groq call, so a per-workspace rate limit can be enforced by
// counting rows in the trailing 60 seconds. Not read by the client.
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
}, (t) => [index("ai_usage_ws_idx").on(t.workspaceId, t.createdAt)]);
