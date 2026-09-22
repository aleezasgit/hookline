# Hookline: Implementation Guide

This is the build manual. A worker should be able to take any task in section 18, read the sections it references, and write the code without making product or architecture decisions. If something here is ambiguous, pick the simplest option that matches `product.md` and leave a `// NOTE:` comment.

Read order for a new worker: `CLAUDE.md` → this file's section for your task → `architecture.md` if you need the bigger picture.

---

## 1. Pre-start checklist (before the assignment clock starts)

Setup only. Nothing specific to the brief.

- [ ] fal.ai account, API key, **$15 of credit** (custom amount). Auto top-up off. Low-balance email alert on at $5.
- [ ] Groq API key
- [ ] A Postgres `DATABASE_URL` (any provider)
- [ ] Scaffold the app (section 2) and confirm `npm run dev` works
- [ ] Models are already decided: Seedance 1.5 Pro for both tiers (section 4.2). Open its API tab on fal and compare the field names with `seedanceInput`.
- [ ] Run `scripts/fal-smoke.ts` (section 4.7). It verifies fields, output shape, price, and gives you real output URLs.
- [ ] **CORS test** (step 5 of section 4.7).
- [ ] **Groq vision test.** One call to `qwen/qwen3.8-27b` with an image URL and JSON mode (section 11.1 code). Confirm it returns JSON.
- [ ] Save 3 of the smoke-test outputs as `public/mock/sample-1.mp4`, `sample-2.mp4`, `sample-3.mp4`.

---

## 2. Setup

```bash
npx create-next-app@latest hookline --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd hookline
npm i @fal-ai/client groq-sdk drizzle-orm postgres zod swr sonner clsx lucide-react
npm i -D drizzle-kit dotenv tsx
npx shadcn@latest init
npx shadcn@latest add button dialog tabs tooltip textarea input select checkbox badge skeleton dropdown-menu
```

**Next.js version note.** Check `next` in `package.json`.
- Next 15: the edge file is `middleware.ts` exporting `middleware`.
- Next 16 or later: the file is `proxy.ts` exporting `proxy`. Same body.
- In both, route `params` and `cookies()` are async: `const { id } = await params`, `const jar = await cookies()`.

**`.env.local`**
```
FAL_KEY=
GROQ_API_KEY=
DATABASE_URL=
ENGINE_MODE=mock            # mock | fal
INITIAL_CREDITS=300
MAX_DAILY_GENERATIONS=60     # hard ceiling, protects the $15 budget
```

**`drizzle.config.ts`**
```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

**`package.json` scripts to add**
```json
"db:push": "drizzle-kit push"
```

---

## 3. Shared types: `lib/types.ts` (frozen after hour 1)

```ts
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
```

---

## 4. Config files

### 4.1 `config/limits.ts`
```ts
export const LIMITS = {
  initialCredits: Number(process.env.INITIAL_CREDITS ?? 300),
  maxActivePerWorkspace: 8,
  maxDailyGenerations: Math.min(60, Number(process.env.MAX_DAILY_GENERATIONS ?? 60)),
  generationTimeoutMs: 10 * 60 * 1000,
  submitGraceMs: 2 * 60 * 1000,       // queued with no request id for longer than this = failed
  pollMs: 3000,
  maxUploadBytes: 4 * 1024 * 1024,
  maxFrameBytes: 400 * 1024,
  mediaHostSuffixes: ["fal.media", "fal.ai", "fal.run"], // extend if outputs come from another host
};
```

### 4.2 `config/models.ts`

**Model decision (final, do not change without the lead):** both tiers use **ByteDance Seedance 1.5 Pro on fal**, with **audio off**. The tiers differ only by resolution.

| Tier | Resolution | Audio | Approx. real cost per 5s clip | Credits charged |
|---|---|---|---|---|
| Fast (drafts) | 480p | off | about $0.06 | 10 |
| Pro (finals) | 720p | off | about $0.13 | 25 |

Endpoints:
- text-to-video: `fal-ai/bytedance/seedance/v1.5/pro/text-to-video`
- image-to-video: `fal-ai/bytedance/seedance/v1.5/pro/image-to-video`

Pricing basis (from the fal model page): tokens = (height x width x FPS x duration) / 1024, charged at $1.2 per million tokens without audio ($2.4 with audio). Credits deliberately overstate real cost so the budget has a safety margin. Never turn audio on: the app does not use sound and audio doubles the cost.

**Field names must be verified** against the model page's API tab (or by running `scripts/fal-smoke.ts`, section 4.7). The names below are the expected ones. Every place that depends on them is marked `// VERIFY`. If the API rejects a field, fix it here and nowhere else.

```ts
import type { Aspect, ModelKey, Tier } from "@/lib/types";

export interface BuildArgs {
  mode: "t2v" | "i2v";
  prompt: string;
  imageUrl?: string | null;
  aspect: Aspect;
  duration: number;
}

export interface ModelConfig {
  key: ModelKey;
  label: string;
  description: string;
  tier: Tier;
  costCredits: number;
  durations: number[];
  defaultDuration: number;
  aspects: Aspect[];
  endpoints: { t2v: string; i2v: string };
  buildInput: (a: BuildArgs) => Record<string, unknown>;
  parseOutput: (data: any) => string | null;
}

const SEEDANCE_15 = {
  t2v: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
  i2v: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
};

function seedanceInput(resolution: "480p" | "720p") {
  return ({ mode, prompt, imageUrl, aspect, duration }: BuildArgs) => {
    const base = {
      prompt,
      resolution,                 // VERIFY: field name and allowed values
      duration: String(duration), // VERIFY: string or number
      aspect_ratio: aspect,       // VERIFY: supported on i2v too; if rejected, omit for i2v
      generate_audio: false,      // VERIFY: exact name of the audio toggle. Audio must be OFF.
    };
    return mode === "i2v" ? { ...base, image_url: imageUrl } : base;
  };
}

const parseSeedance = (data: any): string | null => data?.video?.url ?? null; // VERIFY output shape

export const MODELS: Record<ModelKey, ModelConfig> = {
  fast: {
    key: "fast",
    label: "Fast",
    description: "Quick drafts for testing ideas",
    tier: "draft",
    costCredits: 10,
    durations: [5],
    defaultDuration: 5,
    aspects: ["9:16", "16:9", "1:1"],
    endpoints: SEEDANCE_15,
    buildInput: seedanceInput("480p"),
    parseOutput: parseSeedance,
  },
  pro: {
    key: "pro",
    label: "Pro",
    description: "Sharper quality for final renders",
    tier: "final",
    costCredits: 25,
    durations: [5],
    defaultDuration: 5,
    aspects: ["9:16", "16:9", "1:1"],
    endpoints: SEEDANCE_15,
    buildInput: seedanceInput("720p"),
    parseOutput: parseSeedance,
  },
};

export const getModel = (key: string): ModelConfig => {
  const m = MODELS[key as ModelKey];
  if (!m) throw new Error(`Unknown model ${key}`);
  return m;
};
```

Note: on image-to-video the output shape may follow the input image. That is why campaign photos (and Create photos when 9:16 is chosen) are letterboxed to 9:16 in the browser before upload (section 13.1).

### 4.2.1 Budget rules

Total fal budget is **$15** for building, testing, the demo, and reviewers. Plan:

| Use | Clips | Approx. cost |
|---|---|---|
| Smoke tests (section 4.7) | 4 Fast + 1 Pro | ~$0.40 |
| Preset previews (section 4.8) | 11 Pro | ~$1.45 |
| Integration and full testing | ~60 Fast + ~10 Pro | ~$4.90 |
| Buffer for 8x reviewers | | ~$8 |

Rules for every worker:
- Build in `ENGINE_MODE=mock`. Only the lead switches to `fal`, and only for integration and the final QA.
- Never write loops, retries or scripts that call fal repeatedly, other than the two scripts in 4.7 and 4.8.
- Never raise `MAX_DAILY_GENERATIONS` above 60 or `INITIAL_CREDITS` above 300.
- If a real generation fails, read the error before retrying. A wrong input field fails every time.

### 4.3 `config/presets.ts`
`template` is used on the Create page with `{subject}` replaced. `styleSuffix` is appended in both Create and Campaign mode.

```ts
import type { Aspect, ModelKey, PresetCategory } from "@/lib/types";

export interface Preset {
  key: string;
  name: string;
  category: PresetCategory;
  description: string;
  template: string;
  styleSuffix: string;
  defaultModel: ModelKey;
  defaultAspect: Aspect;
  placeholder: string; // prompt box placeholder on Create
}

export const PRESETS: Preset[] = [
  // Camera
  { key: "crash-zoom", name: "Crash Zoom", category: "camera",
    description: "A sudden fast zoom straight into the subject",
    template: "{subject}. The camera starts wide and performs a sudden, fast crash zoom straight into the subject, then settles.",
    styleSuffix: "Dramatic fast zoom-in, cinematic lighting, sharp focus, high energy.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A sneaker on a wet street at night" },
  { key: "dolly-in", name: "Dolly In", category: "camera",
    description: "A slow, smooth push toward the subject",
    template: "{subject}. A slow, smooth dolly push-in toward the subject.",
    styleSuffix: "Smooth dolly-in camera move, shallow depth of field, cinematic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A perfume bottle on a marble counter" },
  { key: "orbit-360", name: "360 Orbit", category: "camera",
    description: "The camera circles all the way around",
    template: "{subject}. The camera orbits 360 degrees around the subject at eye level.",
    styleSuffix: "Continuous orbit camera move, subject stays centered, studio-quality lighting.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "Headphones on a pedestal" },
  { key: "fpv-fly-through", name: "FPV Drone", category: "camera",
    description: "A fast drone swoop through the scene",
    template: "{subject}. An FPV drone flies fast through the scene and swoops past the subject.",
    styleSuffix: "FPV drone shot, fast fluid motion, motion blur, dynamic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A coffee cart in a busy market" },
  { key: "bullet-time", name: "Bullet Time", category: "camera",
    description: "Frozen moment, camera sweeps around it",
    template: "{subject}. Motion freezes mid-action while the camera sweeps around it in slow motion.",
    styleSuffix: "Bullet time effect, frozen moment, sweeping camera, crisp detail.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A skateboarder mid-jump" },
  // Effects
  { key: "disintegrate", name: "Disintegrate", category: "effects",
    description: "The subject breaks into glowing particles",
    template: "{subject}. The subject slowly disintegrates into glowing particles that drift away.",
    styleSuffix: "Particle disintegration effect, dark background, glowing embers, cinematic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A red rose on black" },
  { key: "levitate", name: "Levitate", category: "effects",
    description: "The subject lifts off and floats",
    template: "{subject}. The subject lifts off the surface and floats, rotating slowly in mid-air.",
    styleSuffix: "Levitation effect, soft shadow below, clean background, premium product feel.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A smartwatch on a desk" },
  { key: "splash-reveal", name: "Splash Reveal", category: "effects",
    description: "A slow-motion liquid burst reveals the subject",
    template: "{subject}. A burst of liquid splashes around the subject in slow motion, revealing it.",
    styleSuffix: "High-speed liquid splash, slow motion, droplets frozen in light, commercial look.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A can of sparkling water" },
  // UGC
  { key: "ugc-handheld", name: "Handheld Review", category: "ugc",
    description: "Phone footage, like a quick honest review",
    template: "{subject}. Filmed by a person holding a phone, casually showing it to camera like a quick honest review.",
    styleSuffix: "Shot on a phone, handheld with slight natural shake, natural indoor lighting, vertical, authentic creator video, not an ad.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A reusable water bottle" },
  { key: "ugc-unboxing", name: "Unboxing POV", category: "ugc",
    description: "First-person hands opening the package",
    template: "{subject}. First-person POV of hands opening a package and revealing it.",
    styleSuffix: "POV phone footage, handheld, natural light, casual home setting, authentic unboxing, vertical.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "Wireless earbuds in a small box" },
  { key: "ugc-in-use", name: "In Real Life", category: "ugc",
    description: "Someone using it in an everyday moment",
    template: "{subject}. Someone using it naturally in an everyday moment at home or on the street.",
    styleSuffix: "Candid phone footage, handheld, natural light, real-life setting, authentic creator content, vertical.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A habit tracker app on a phone" },
];

export const PRESET_KEYS = PRESETS.map((p) => p.key);
export const getPreset = (key: string | null | undefined) =>
  PRESETS.find((p) => p.key === key) ?? null;
export const DEFAULT_CAMPAIGN_PRESET = "ugc-handheld";
```

### 4.4 `config/hooks.ts`
```ts
export const HOOK_TYPES = {
  problem_first: { label: "Problem first", description: "Opens on a relatable pain point, then the product" },
  pov:           { label: "POV", description: "A first-person 'POV: you...' scenario" },
  before_after:  { label: "Before and after", description: "Shows the change the product makes" },
  reaction:      { label: "Reaction", description: "A genuine surprised or delighted reaction" },
  myth_bust:     { label: "Myth bust", description: "Calls out a common mistake or belief" },
  quick_tip:     { label: "Quick tip", description: "A fast 'here is how I...' tip" },
  unboxing:      { label: "Unboxing", description: "First impression while opening it" },
  day_in_life:   { label: "Day in the life", description: "The product in a normal routine" },
} as const;
export type HookType = keyof typeof HOOK_TYPES;
export const HOOK_KEYS = Object.keys(HOOK_TYPES) as [HookType, ...HookType[]];
```

### 4.5 `config/rubric.ts`
```ts
export const RUBRIC = [
  { key: "hook", label: "Hook strength",
    definition: "Would the first 2 seconds stop someone scrolling? Is the subject or product clear immediately?" },
  { key: "native", label: "Feels native",
    definition: "Does it look like a real person filmed it for their own account, rather than a polished ad or obvious AI?" },
  { key: "onBrief", label: "On brief",
    definition: "Does it clearly show the product and fit the audience, goal and tone of the brief?" },
  { key: "quality", label: "Visual quality",
    definition: "Is it free of AI artifacts such as warped hands or faces, melting objects, garbled text or flicker?" },
] as const;
```

### 4.6 `config/ai.ts`
```ts
export const AI = {
  model: "qwen/qwen3.8-27b",
  reasoningEffort: "none" as const,   // instruct mode: fast, no thinking
  temperature: { concepts: 0.8, review: 0.2, rewrite: 0.5, enhance: 0.6 },
  maxTokens: 2048,
};
```

### 4.7 `scripts/fal-smoke.ts` (run once, before building the engine)

Purpose: confirm the Seedance field names, output shape, real price and CORS, spending about $0.40. Install `tsx` as a dev dependency. Run with `npx tsx scripts/fal-smoke.ts`.

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { fal } from "@fal-ai/client";
import { MODELS } from "../config/models";

fal.config({ credentials: process.env.FAL_KEY });

// A public product-style photo. Replace with any direct image URL if this one fails.
const IMAGE = process.argv[2] ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/640px-PNG_transparency_demonstration_1.png";

async function run(label: string, modelKey: "fast" | "pro", mode: "t2v" | "i2v") {
  const model = MODELS[modelKey];
  const input = model.buildInput({
    mode,
    prompt: "A sneaker on a wet street at night, slow dolly in, cinematic lighting",
    imageUrl: mode === "i2v" ? IMAGE : null,
    aspect: "9:16",
    duration: 5,
  });
  console.log(`\n=== ${label} ===\nendpoint: ${model.endpoints[mode]}\ninput:`, input);
  const t0 = Date.now();
  try {
    const res = await fal.subscribe(model.endpoints[mode], { input, logs: false });
    const url = model.parseOutput(res.data);
    console.log(`ok in ${Math.round((Date.now() - t0) / 1000)}s`);
    console.log("parsed url:", url);
    if (!url) console.log("raw output (fix parseOutput):", JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.log("FAILED:", JSON.stringify(e?.body ?? e?.message, null, 2));
  }
}

(async () => {
  await run("Fast text-to-video", "fast", "t2v");
  await run("Fast image-to-video", "fast", "i2v");
  await run("Pro image-to-video", "pro", "i2v");
})();
```

What to do with the output:
1. Any `FAILED` with a validation message: fix the field in `seedanceInput` (4.2) and rerun only that case (comment the others out).
2. `parsed url: null`: fix `parseSeedance` using the printed raw output.
3. Open the fal dashboard usage page and check the cost per clip is close to the table in 4.2. If it is more than double, tell the lead.
4. Save 3 of the output videos as `public/mock/sample-1.mp4` to `sample-3.mp4` (these become the mock outputs).
5. CORS check: run `npm run dev`, open any page, and in the browser console run `await (await fetch("<a parsed url>")).blob()`. A Blob means direct frame capture works. An error means the `/api/media` proxy will be used (already built in, nothing to change).

### 4.8 `scripts/gen-previews.ts` (run once, after smoke tests pass)

Purpose: make one looping preview clip per preset for the Explore page, spending about $1.45. Output goes to `public/previews/<key>.mp4`. Skips presets whose file already exists, so a rerun never pays twice.

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fal } from "@fal-ai/client";
import { MODELS } from "../config/models";
import { PRESETS } from "../config/presets";
import { composeCreatePrompt } from "../lib/prompt";

fal.config({ credentials: process.env.FAL_KEY });
mkdirSync("public/previews", { recursive: true });

(async () => {
  const model = MODELS.pro;
  for (const p of PRESETS) {
    const path = `public/previews/${p.key}.mp4`;
    if (existsSync(path)) { console.log("skip", p.key); continue; }
    const prompt = composeCreatePrompt(p.key, p.placeholder, false);
    try {
      const res = await fal.subscribe(model.endpoints.t2v, {
        input: model.buildInput({ mode: "t2v", prompt, aspect: "9:16", duration: 5 }),
      });
      const url = model.parseOutput(res.data);
      if (!url) { console.log("no url", p.key); continue; }
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(path, buf);
      console.log("saved", path);
    } catch (e: any) {
      console.log("failed", p.key, e?.body ?? e?.message);
    }
  }
})();
```

Rules: run it sequentially as written (no parallel calls), check a couple of previews look right before celebrating, and commit the files. `lib/prompt.ts` must not import `server-only` so this script can use it.

---

## 5. Database

### 5.1 `lib/db/schema.ts`
```ts
import { pgTable, uuid, text, integer, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
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
  aiReview: jsonb("ai_review").$type<AiReview>(),
  decision: text("decision").notNull().default("pending"),
  decisionNote: text("decision_note"),
  createdAt: ts("created_at").defaultNow().notNull(),
  completedAt: ts("completed_at"),
}, (t) => [
  index("gen_ws_idx").on(t.workspaceId, t.createdAt),
  index("gen_campaign_idx").on(t.campaignId),
  index("gen_status_idx").on(t.status),
]);

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  generationId: uuid("generation_id"),
  createdAt: ts("created_at").defaultNow().notNull(),
});
```

Run `npm run db:push` after any schema change.

### 5.2 `lib/db/index.ts`
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = g.pg ?? postgres(process.env.DATABASE_URL!, { prepare: false, max: 5 });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
export * from "./schema";
```

Serialization: services return Drizzle rows. `NextResponse.json` turns `Date` into ISO strings, which matches `lib/types.ts`. Cast rows with `as unknown as Generation` at the service boundary.

---

## 6. Errors and the route wrapper: `lib/errors.ts`

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ErrorCode } from "@/lib/types";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409, INSUFFICIENT_CREDITS: 402,
  TOO_MANY_ACTIVE: 429, DAILY_CAP: 429, AI_FAILED: 502, PROVIDER_FAILED: 502, INTERNAL: 500,
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}

type Ctx = { params: Promise<Record<string, string>> };

export function route(handler: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const data = await handler(req, ctx);
      return NextResponse.json(data);
    } catch (e) {
      if (e instanceof AppError)
        return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: { code: "VALIDATION", message: e.issues[0]?.message ?? "Invalid input" } },
          { status: 400 });
      console.error(e);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong. Try again." } }, { status: 500 });
    }
  };
}
```

Every route file starts with `export const runtime = "nodejs";`. AI routes also set `export const maxDuration = 60;`.

---

## 7. Workspace (no auth)

### 7.1 `middleware.ts` (or `proxy.ts` on Next 16+)
```ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.cookies.get("ws_id")) return NextResponse.next();
  const id = crypto.randomUUID();
  req.cookies.set("ws_id", id); // so this same request already sees it
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set("ws_id", id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock/|previews/|llms.txt).*)"],
};
```

### 7.2 `lib/workspace.ts`
```ts
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
```

---

## 8. Engine: `lib/engine/*`

### 8.1 `lib/engine/types.ts`
```ts
import type { Aspect, ModelKey } from "@/lib/types";

export interface SubmitInput {
  generationId: string;
  modelKey: ModelKey;
  prompt: string;        // composed prompt
  imageUrl?: string | null;
  aspect: Aspect;
  duration: number;
}

export interface StatusInput {
  generationId: string;
  endpoint: string;
  requestId: string;
  modelKey: ModelKey;
  prompt: string;
  createdAt: Date;
}

export type ProviderState =
  | { state: "queued" }
  | { state: "running" }
  | { state: "done"; outputUrl: string }
  | { state: "failed"; error: string };

export interface VideoProvider {
  name: "fal" | "mock";
  submit(input: SubmitInput): Promise<{ endpoint: string; requestId: string }>;
  status(input: StatusInput): Promise<ProviderState>;
  upload(file: File): Promise<string>;
}
```

### 8.2 `lib/engine/fal.ts`
```ts
import "server-only";
import { fal } from "@fal-ai/client";
import { getModel } from "@/config/models";
import type { VideoProvider } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

export const falProvider: VideoProvider = {
  name: "fal",

  async submit({ modelKey, prompt, imageUrl, aspect, duration }) {
    const model = getModel(modelKey);
    const mode = imageUrl ? "i2v" : "t2v";
    const endpoint = model.endpoints[mode];
    const input = model.buildInput({ mode, prompt, imageUrl, aspect, duration });
    const { request_id } = await fal.queue.submit(endpoint, { input });
    return { endpoint, requestId: request_id };
  },

  async status({ endpoint, requestId, modelKey }) {
    const s = await fal.queue.status(endpoint, { requestId, logs: false });
    if (s.status === "IN_QUEUE") return { state: "queued" };
    if (s.status === "IN_PROGRESS") return { state: "running" };
    // COMPLETED: success or failure is only known from the result call
    try {
      const { data } = await fal.queue.result(endpoint, { requestId });
      const url = getModel(modelKey).parseOutput(data);
      return url ? { state: "done", outputUrl: url } : { state: "failed", error: "The model returned no video." };
    } catch (e: any) {
      return { state: "failed", error: shortError(e) };
    }
  },

  async upload(file) {
    return fal.storage.upload(file);
  },
};

function shortError(e: any) {
  const msg = e?.body?.detail?.[0]?.msg ?? e?.body?.detail ?? e?.message ?? "Generation failed.";
  return String(typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 200);
}
```

### 8.3 `lib/engine/mock.ts`
```ts
import "server-only";
import type { VideoProvider } from "./types";

// Deterministic fake: queued for 4s, running until 12s, then done.
// A prompt containing "[fail]" fails, so error states can be tested.
export const mockProvider: VideoProvider = {
  name: "mock",
  async submit({ generationId }) {
    return { endpoint: "mock", requestId: `mock_${generationId}` };
  },
  async status({ generationId, prompt, createdAt }) {
    const age = Date.now() - createdAt.getTime();
    if (age < 4000) return { state: "queued" };
    if (age < 12000) return { state: "running" };
    if (prompt.includes("[fail]")) return { state: "failed", error: "Mock failure for testing." };
    const n = (parseInt(generationId.replace(/-/g, "").slice(0, 6), 16) % 3) + 1;
    return { state: "done", outputUrl: `/mock/sample-${n}.mp4` };
  },
  async upload(file) {
    // Only used if FAL_KEY is absent. Keeps the app usable offline.
    const buf = Buffer.from(await file.arrayBuffer());
    return `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
  },
};
```

Mock output URLs are relative (`/mock/...`). The client helpers in section 13 handle relative URLs.

### 8.4 `lib/engine/index.ts`
```ts
import "server-only";
import { falProvider } from "./fal";
import { mockProvider } from "./mock";
import type { VideoProvider } from "./types";

export const engineMode = (): "fal" | "mock" =>
  process.env.ENGINE_MODE === "fal" ? "fal" : "mock";

export const getProvider = (name: "fal" | "mock"): VideoProvider =>
  name === "fal" ? falProvider : mockProvider;

// Uploads use fal storage whenever a key exists, even in mock mode. It spends no credits.
export const uploadProvider = (): VideoProvider =>
  process.env.FAL_KEY ? falProvider : mockProvider;
```

---

## 9. Prompt composition: `lib/prompt.ts`
```ts
import { getPreset } from "@/config/presets";

export function composeCreatePrompt(presetKey: string | null, userPrompt: string, hasImage: boolean) {
  const preset = getPreset(presetKey);
  const subject = userPrompt.trim() || (hasImage ? "The subject from the image" : "A stylish product on a clean surface");
  if (!preset) return subject;
  return `${preset.template.replace("{subject}", subject)} ${preset.styleSuffix}`;
}

export function composeConceptPrompt(presetKey: string, visualPrompt: string) {
  const preset = getPreset(presetKey);
  return preset ? `${visualPrompt.trim()} ${preset.styleSuffix}` : visualPrompt.trim();
}
```

---

## 10. Services

### 10.1 `lib/credits.ts`
Helpers used inside transactions.

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import { workspaces, creditLedger } from "@/lib/db";
import { AppError } from "@/lib/errors";

import { db } from "@/lib/db";
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
```

### 10.2 `lib/generations.ts`

Public functions and exact behavior:

```ts
export interface CreateGenInput {
  tier: Tier;
  modelKey: ModelKey;
  presetKey: string | null;
  prompt: string;
  composedPrompt: string;
  imageUrl: string | null;
  aspect: Aspect;
  duration: number;
  campaignId?: string | null;
  conceptId?: string | null;
  parentId?: string | null;
}
```

**`assertCapacity(workspaceId, n)`**
1. Count this workspace's generations with status in `ACTIVE_STATUSES`. If `active + n > LIMITS.maxActivePerWorkspace` → `TOO_MANY_ACTIVE`: "You have {active} videos generating. Wait for a few to finish."
2. Count all generations with `created_at >=` UTC midnight today. If `today + n > LIMITS.maxDailyGenerations` → `DAILY_CAP`: "The demo reached today's generation limit. Try again tomorrow."

**`createGeneration(ws, input, opts?: { skipCapacity?: boolean })`**
1. `model = getModel(input.modelKey)`. If `input.aspect` not in `model.aspects` or `input.duration` not in `model.durations` → `VALIDATION`.
2. Unless `skipCapacity`, `assertCapacity(ws.id, 1)`.
3. `db.transaction`: insert generation with `status="queued"`, `provider=engineMode()`, `cost=model.costCredits`, all input fields → `chargeInTx(tx, ws.id, cost, gen.id)`. Insert first so the ledger has the ID; the transaction rolls back both if the charge fails.
4. Outside the transaction: `getProvider(gen.provider).submit({...})`.
   - Success: update `providerEndpoint`, `providerRequestId`.
   - Throw: `failGeneration(gen.id, "Could not start the generation. Credits refunded.")`.
5. Return the fresh row.

**`createGenerationsBatch(ws, inputs[])`**
1. `assertCapacity(ws.id, inputs.length)`.
2. Sum costs. If `ws.credits < total` → `INSUFFICIENT_CREDITS`: "Not enough credits. This batch needs {total}."
3. `Promise.all(inputs.map(i => createGeneration(ws, i, { skipCapacity: true })))`.

**`failGeneration(id, error)`**: one transaction:
```ts
const [row] = await tx.update(generations)
  .set({ status: "failed", error, completedAt: new Date() })
  .where(and(eq(generations.id, id), inArray(generations.status, ["queued", "running"])))
  .returning();
if (row && row.cost > 0) await refundInTx(tx, row.workspaceId, row.cost, row.id);
```
Return the row (or re-select if the update matched nothing).

**`refreshGeneration(gen)`**
1. If not active → return `gen`.
2. `age = now - createdAt`. If `age > generationTimeoutMs` → `failGeneration(id, "Timed out after 10 minutes. Credits refunded.")`.
3. If no `providerRequestId`: if `age > submitGraceMs` → fail with "Could not start the generation. Credits refunded."; else return `gen`.
4. `try { s = await provider.status(...) } catch { return gen; }` (network hiccups never fail a job).
5. `running` and current `queued` → update status to `running`.
6. `done` → conditional update (`WHERE status IN active`) to `done`, `outputUrl`, `completedAt`.
7. `failed` → `failGeneration(id, s.error)`.
8. Return the fresh row.

**`refreshMany(gens)`**: `Promise.all` of `refreshGeneration` for active ones only, returns the full list with active ones replaced.

**`getOwnedGeneration(ws, id)`**: select by id and workspaceId, else `NOT_FOUND`: "Video not found."

**`listGenerations(ws, filter, limit)`**: filter `all | draft | final | campaign | create` (`create` = campaignId is null). Newest first. Refresh active ones before returning.

**`retryGeneration(ws, id)`**: must be `failed`, else `CONFLICT`. Same inputs, same `parentId` as the failed one.

**`finalizeGeneration(ws, id)`**: must be `done` and `tier="draft"`, else `CONFLICT`: "Only finished drafts can be rendered in Pro." If a non-failed final already exists with this `parentId` → `CONFLICT`: "A Pro render already exists." Create with `tier="final"`, `modelKey="pro"`, same prompt, composed prompt, image, aspect, duration (use Pro's `defaultDuration` if not supported), campaign and concept, `parentId=id`.

**`regenerateGeneration(ws, id, note?)`**: must be a campaign draft that is `done` or `failed`. Load concept and campaign. `newPrompt = await rewritePrompt({ original: gen.prompt, humanNote: note, aiFix: gen.aiReview?.suggestedFix, brief })`. Update `concept.visualPrompt = newPrompt`. Create a draft with `prompt=newPrompt`, `composedPrompt=composeConceptPrompt(concept.presetKey, newPrompt)`, same image, `parentId=id`.

**`decide(ws, id, decision, note?)`**: set `decision`, `decisionNote`. Must be `done`.

**`reviewGeneration(ws, id, frames)`**:
1. Must be `done` with a `campaignId`, else `VALIDATION`.
2. Conditional update `aiReviewStatus` from `none` or `failed` to `pending`. If no row matched → `CONFLICT`: "Review already running."
3. `try { review = await reviewClip({ frames, brief, concept }) ; set done + aiReview }`
   `catch { set failed; throw AI_FAILED "The review could not be completed. Try again." }`
4. Return the fresh row.

### 10.3 `lib/campaigns.ts`

**`createCampaign(ws, brief)`**: insert with `name = brief.productName`.

**`writeConcepts(ws, campaignId)`**
1. Conditional update `conceptsStatus` to `generating` where it is not `generating`. No match → `CONFLICT`: "Already writing hooks."
2. Load existing concepts and the concept IDs that have generations ("locked").
3. `fresh = await generateConcepts({ brief, count: brief.conceptCount - locked.length, avoid: locked hook lines })`. If the count is 0 or less, skip the AI and set `ready`.
4. Transaction: delete unlocked concepts; insert fresh ones with positions after the highest locked position, `selected=true`; set `conceptsStatus="ready"`.
5. On any error: set `failed`, throw `AI_FAILED`: "Could not write hooks. Try again."

**`rerollConcept(ws, conceptId)`**: if it has generations → `CONFLICT`: "This hook already has a video. Use Fix and regenerate instead." Otherwise `generateConcepts({ brief, count: 1, avoid: all other hook lines })` and update this row's fields (keep `position`, set `selected=true`).

**`updateConcept(ws, conceptId, patch)`**: patch fields `hookLine`, `visualPrompt`, `caption`, `presetKey` (must be in `PRESET_KEYS`), `selected`. Editing text fields on a locked concept → `CONFLICT`. `selected` can always change.

**`generateBatch(ws, campaignId)`**
1. Targets: concepts with `selected=true` and no generations. None → `VALIDATION`: "Select at least one hook without a video."
2. For each: `{ tier:"draft", modelKey:"fast", presetKey, prompt: visualPrompt, composedPrompt: composeConceptPrompt(presetKey, visualPrompt), imageUrl: brief.productImageUrl, aspect:"9:16", duration: 5, campaignId, conceptId }`.
3. `createGenerationsBatch`. Return the view.

**`getCampaignView(ws, campaignId)`**
1. Owned campaign or `NOT_FOUND`.
2. Concepts by `position`. Generations by `campaignId`, newest first, then `refreshMany`.
3. Per concept: `versions` = drafts for it, `latest = versions[0] ?? null`, `final` = newest `tier="final"` for it.
4. Counts over `latest` per concept: `generating` if active, `needsReview` if done and pending, `approved`, `rejected`.

**`listCampaigns(ws)`**: newest first, with concept count and approved count (count concepts whose latest draft is approved; computing in JS is fine).

---

## 11. AI layer: `lib/ai/*`

### 11.1 `lib/ai/client.ts`
```ts
import "server-only";
import Groq from "groq-sdk";
import type { ZodType } from "zod";
import { AI } from "@/config/ai";
import { AppError } from "@/lib/errors";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function aiJson<T>(schema: ZodType<T>, o: {
  system: string; user: string; images?: string[]; temperature: number;
}): Promise<T> {
  const userContent = o.images?.length
    ? [{ type: "text", text: o.user }, ...o.images.map((url) => ({ type: "image_url", image_url: { url } }))]
    : o.user;
  const messages: any[] = [
    { role: "system", content: o.system },
    { role: "user", content: userContent },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await groq.chat.completions.create({
      model: AI.model,
      messages,
      temperature: o.temperature,
      max_completion_tokens: AI.maxTokens,
      response_format: { type: "json_object" },
      reasoning_effort: AI.reasoningEffort,
    } as any);
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = schema.safeParse(extractJson(text));
    if (parsed.success) return parsed.data;
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `That did not match the required JSON shape (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}). Reply again with only the corrected JSON.` },
    );
  }
  throw new AppError("AI_FAILED", "The AI returned an unexpected response. Try again.");
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json|```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}
```

### 11.2 `lib/ai/concepts.ts`
```ts
const ConceptOut = z.object({
  hook_type: z.enum(HOOK_KEYS),
  hook_line: z.string().min(3).max(120),
  visual_prompt: z.string().min(20).max(800),
  preset_key: z.string(),
  caption: z.string().min(1).max(300),
});
const Out = z.object({ concepts: z.array(ConceptOut).min(1) });

export async function generateConcepts(args: { brief: Brief; count: number; avoid: string[] }) {
  // returns up to `count` items; preset_key not in PRESET_KEYS becomes DEFAULT_CAMPAIGN_PRESET
}
```
Call `aiJson(Out, { system, user, images: brief.productImageUrl && !brief.productImageUrl.startsWith("data:") ? [brief.productImageUrl] : undefined, temperature: AI.temperature.concepts })`. Slice to `count`.

**System prompt** (build the two lists from config):
```
You are a short-form video strategist at a creator network that makes organic TikTok, Instagram Reels and YouTube Shorts content for consumer brands.
Organic content must feel native, like a real person posted it from their own account. It must not look like an ad.

Each concept you write becomes ONE 5-second vertical AI-generated video clip.

Rules for every concept:
- hook_type: one of these keys:
{for each HOOK_TYPES: "  - key: description"}
- hook_line: the line a creator would say or show on screen in the first 2 seconds. Maximum 12 words. Conversational and specific. No hashtags, no emojis.
- visual_prompt: a prompt for an AI video model describing ONE continuous 5-second shot. Include subject, action, setting, camera angle and lighting. The product must be visible in the first second. No on-screen text, no logos, no split screens, no scene cuts, no dialogue. 40 to 90 words.
- preset_key: one of these keys:
{for each PRESETS: "  - key: name, description"}
  Pick the best fit. Prefer ugc presets for relatable, funny and educational tones.
- caption: the post caption. Maximum 150 characters including 2 or 3 relevant hashtags.

Make the concepts clearly different from each other: different hook types, settings, emotions and presets.
Return only JSON in exactly this shape:
{"concepts":[{"hook_type":"...","hook_line":"...","visual_prompt":"...","preset_key":"...","caption":"..."}]}
```

**User prompt**
```
Brand brief
Product: {productName}
What it is: {productDescription}
Audience: {audience}
Goal: {goal}
Platform: {TikTok | Instagram Reels | YouTube Shorts}
Tone: {tone}
{if image} The attached image is the product photo. Every video will START FROM THIS PHOTO, so describe motion and camera action that can plausibly begin from it.
{if avoid.length} Do not repeat or closely imitate these existing hooks: {avoid joined with " | "}
Write {count} concepts.
```

### 11.3 `lib/ai/review.ts`
```ts
const ReviewOut = z.object({
  scores: z.object({
    hook: z.number().min(1).max(5), native: z.number().min(1).max(5),
    on_brief: z.number().min(1).max(5), quality: z.number().min(1).max(5),
  }),
  reasons: z.object({
    hook: z.string().max(200), native: z.string().max(200),
    on_brief: z.string().max(200), quality: z.string().max(200),
  }),
  suggested_fix: z.string().min(3).max(300),
});

export async function reviewClip(args: { frames: string[]; brief: Brief; concept: Concept }): Promise<AiReview>
```
After parsing: round each score, `overall = round(avg, 1)`, `verdict = overall >= 4 ? "strong" : overall >= 3 ? "okay" : "weak"`, map `on_brief` → `onBrief`, `suggested_fix` → `suggestedFix`. Temperature `AI.temperature.review`.

**System prompt**
```
You are a strict content reviewer at a creator network. You pre-screen short AI-generated vertical videos before a human decides whether they get posted as organic content for a brand.
You receive 4 frames from one 5-second clip, in order: 0.5 seconds, 1.5 seconds, the middle, the last frame. You also receive the brand brief and the hook the clip was meant to deliver.

Score each criterion from 1 to 5. Be critical. 5 is rare and means ready to post. 3 means usable with changes. 1 means unusable.
{for each RUBRIC: "- {key as hook|native|on_brief|quality}: {label}. {definition}"}

For each criterion give one short reason, maximum 20 words, pointing at something visible in the frames.
suggested_fix: the single most valuable change to the video prompt, written as an instruction, maximum 25 words.
Return only JSON in exactly this shape:
{"scores":{"hook":0,"native":0,"on_brief":0,"quality":0},"reasons":{"hook":"","native":"","on_brief":"","quality":""},"suggested_fix":""}
```

**User prompt**
```
Brief: {productName}, {productDescription}. Audience: {audience}. Goal: {goal}. Tone: {tone}. Platform: {platform}.
Intended hook: "{hookLine}"
What the clip was meant to show: {visualPrompt}
The 4 frames follow in order.
```

### 11.4 `lib/ai/rewrite.ts`
```ts
const Out = z.object({ visual_prompt: z.string().min(20).max(800) });
export async function rewritePrompt(a: { original: string; humanNote?: string | null; aiFix?: string | null; brief: Brief }): Promise<string>
```
If both `humanNote` and `aiFix` are empty, use aiFix-less instruction "Make the hook stronger in the first second." Temperature `AI.temperature.rewrite`.

**System prompt**
```
You rewrite prompts for an AI video model that makes ONE continuous 5-second vertical shot.
Apply the feedback to the original prompt. If a human note is given, it takes priority over the reviewer suggestion.
Keep what already works. Rules: the product is visible in the first second, one continuous shot, no on-screen text, no logos, no scene cuts, no dialogue. 40 to 90 words.
Return only JSON: {"visual_prompt":"..."}
```
**User prompt**
```
Product: {productName}, {productDescription}
Original prompt: {original}
{if humanNote} Human note: {humanNote}
{if aiFix} Reviewer suggestion: {aiFix}
```

### 11.5 `lib/ai/enhance.ts`
```ts
const Out = z.object({ prompt: z.string().min(3).max(500) });
export async function enhancePrompt(a: { prompt: string; presetKey: string | null }): Promise<string>
```
**System prompt**
```
You improve prompts for an AI video model that makes one short continuous shot.
Keep the user's idea and subject. Add concrete detail about the subject, action, setting, lighting and mood.
Do not describe camera movement; the chosen preset controls the camera. Maximum 60 words.
Return only JSON: {"prompt":"..."}
```
**User prompt**: `Preset: {preset name and description or "none"}\nPrompt: {prompt}`

---

## 12. API routes

All routes: `export const runtime = "nodejs"`, wrapped in `route()`, first line after params is `const ws = await getWorkspace()`. Bodies validated with zod. Example:

```ts
// app/api/generations/[id]/finalize/route.ts
import { route } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace";
import { finalizeGeneration } from "@/lib/generations";
export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ws = await getWorkspace();
  const generation = await finalizeGeneration(ws, id);
  return { generation };
});
```

| Route | Body / query | Returns | Notes |
|---|---|---|---|
| `GET /api/workspace` | | `{ id, credits }` | |
| `POST /api/upload` | multipart `file` | `{ url }` | Reject missing file or size > `maxUploadBytes` (`VALIDATION`: "Image is too large. Use one under 4 MB."). Only `image/*`. `uploadProvider().upload(file)`. |
| `POST /api/generate` | `{ presetKey: string\|null, modelKey: "fast"\|"pro", prompt: string (max 1000), imageUrl: string\|null, aspect, duration }` | `{ generation }` | Unknown preset → treat as null. `tier` = model's tier. `composedPrompt = composeCreatePrompt(...)`. |
| `GET /api/generations` | `?filter=all\|draft\|final\|campaign\|create&limit=60` | `{ generations }` | limit max 100 |
| `GET /api/generations/:id` | | `{ generation }` | refreshed |
| `POST /api/generations/:id/retry` | | `{ generation }` | |
| `POST /api/generations/:id/finalize` | | `{ generation }` | |
| `POST /api/generations/:id/regenerate` | `{ note?: string (max 500) }` | `{ generation }` | maxDuration 60 |
| `POST /api/generations/:id/review` | `{ frames: string[] (1..4) }` | `{ generation }` | Each frame starts with `data:image/jpeg;base64,` and is under `maxFrameBytes`. maxDuration 60 |
| `PATCH /api/generations/:id/decision` | `{ decision: "pending"\|"approved"\|"rejected", note?: string }` | `{ generation }` | |
| `POST /api/prompt/enhance` | `{ prompt: string (1..1000), presetKey: string\|null }` | `{ prompt }` | maxDuration 60 |
| `GET /api/campaigns` | | `{ campaigns: CampaignSummary[] }` | |
| `POST /api/campaigns` | `{ brief: Brief }` | `{ campaign }` | zod: name 1..80, description 1..300, audience 1..200, conceptCount int 3..6, enums for goal/platform/tone |
| `GET /api/campaigns/:id` | | `CampaignView` | refreshes active generations |
| `POST /api/campaigns/:id/concepts` | | `CampaignView` | maxDuration 60 |
| `POST /api/campaigns/:id/generate` | | `CampaignView` | |
| `PATCH /api/concepts/:id` | partial `{ hookLine, visualPrompt, caption, presetKey, selected }` | `{ concept }` | |
| `POST /api/concepts/:id/reroll` | | `{ concept }` | maxDuration 60 |
| `GET /api/media` | `?url=` | streamed video | See below |

**`/api/media`** (no workspace needed):
```ts
export const GET = async (req: Request) => {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try { target = new URL(raw); } catch { return new Response("Bad url", { status: 400 }); }
  const ok = target.protocol === "https:" &&
    LIMITS.mediaHostSuffixes.some((s) => target.hostname === s || target.hostname.endsWith("." + s));
  if (!ok) return new Response("Host not allowed", { status: 400 });
  const upstream = await fetch(target);
  if (!upstream.ok || !upstream.body) return new Response("Upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      "cache-control": "public, max-age=3600",
    },
  });
};
```
Stream the body. Never buffer the whole video in memory.

---

## 13. Client helpers

### 13.1 `lib/media/resize.ts`
```ts
export async function resizeImage(file: File, opts: { fitAspect?: "9:16" } = {}): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  if (opts.fitAspect === "9:16") {
    canvas.width = 864; canvas.height = 1536;
    // blurred cover background
    const cover = Math.max(canvas.width / bmp.width, canvas.height / bmp.height);
    ctx.filter = "blur(40px) brightness(0.8)";
    ctx.drawImage(bmp, (canvas.width - bmp.width * cover) / 2, (canvas.height - bmp.height * cover) / 2,
      bmp.width * cover, bmp.height * cover);
    ctx.filter = "none";
    // sharp contained foreground
    const contain = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
    ctx.drawImage(bmp, (canvas.width - bmp.width * contain) / 2, (canvas.height - bmp.height * contain) / 2,
      bmp.width * contain, bmp.height * contain);
  } else {
    const scale = Math.min(1, 1536 / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", 0.88));
}
```
Use `fitAspect: "9:16"` on the campaign brief photo, and on Create when the chosen aspect is 9:16 and a photo is added.

### 13.2 `lib/media/fetch.ts`
```ts
export async function fetchVideoBlob(url: string): Promise<Blob> {
  if (url.startsWith("/")) return (await fetch(url)).blob(); // mock files
  try {
    const r = await fetch(url, { mode: "cors" });
    if (r.ok) return await r.blob();
  } catch {}
  const r = await fetch(`/api/media?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("Could not load the video.");
  return r.blob();
}

export async function downloadVideo(url: string, filename: string) {
  const blob = await fetchVideoBlob(url);
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
```

### 13.3 `lib/media/frames.ts`
```ts
const once = (el: HTMLElement, ev: string) => new Promise<void>((r) => el.addEventListener(ev, () => r(), { once: true }));

export async function captureFrames(blob: Blob): Promise<string[]> {
  const src = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = src;
  await once(video, "loadeddata");
  const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
  const times = [0.5, 1.5, d / 2, d - 0.1].map((t) => Math.max(0, Math.min(t, d - 0.05)));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * (video.videoHeight / video.videoWidth || 16 / 9));
  const ctx = canvas.getContext("2d")!;
  const frames: string[] = [];
  for (const t of times) {
    video.currentTime = t;
    await once(video, "seeked");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  URL.revokeObjectURL(src);
  return frames;
}
```

### 13.4 `lib/media/review-queue.ts`
```ts
import { fetchVideoBlob } from "./fetch";
import { captureFrames } from "./frames";
import { api, ApiError } from "@/lib/api";

const MAX = 2;
const seen = new Set<string>();
export const failedLocally = new Set<string>(); // frame capture failed in this browser
const waiting: { id: string; url: string; onDone: () => void }[] = [];
let running = 0;

export function enqueueReview(id: string, url: string, onDone: () => void) {
  if (seen.has(id)) return;
  seen.add(id);
  waiting.push({ id, url, onDone });
  pump();
}

export function retryReview(id: string, url: string, onDone: () => void) {
  seen.delete(id);
  failedLocally.delete(id);
  enqueueReview(id, url, onDone);
}

function pump() {
  while (running < MAX && waiting.length) {
    const job = waiting.shift()!;
    running++;
    (async () => {
      try {
        const frames = await captureFrames(await fetchVideoBlob(job.url));
        await api.post(`/api/generations/${job.id}/review`, { frames });
      } catch (e) {
        // ApiError: server already marked it failed, or 409 means another tab is on it.
        // Anything else: frames could not be captured in this browser.
        if (!(e instanceof ApiError)) failedLocally.add(job.id);
      }
      finally { running--; job.onDone(); pump(); }
    })();
  }
}
```
`ReviewCard` shows "Review unavailable" when `aiReviewStatus === "failed"` or when its ID is in `failedLocally`. "Retry review" calls `retryReview`.

### 13.5 `lib/api.ts`
```ts
import type { ApiErrorBody } from "@/lib/types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const r = await fetch(path, {
    method,
    headers: isForm || body === undefined ? undefined : { "content-type": "application/json" },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong. Try again.", r.status);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
};
export const fetcher = <T>(p: string) => api.get<T>(p);
```
Callers catch `ApiError` and show `toast.error(e.message)`.

### 13.6 Hooks: `lib/hooks/*`
```ts
// use-workspace.ts
export const useWorkspace = () => useSWR<{ id: string; credits: number }>("/api/workspace", fetcher);

// use-generations.ts
export const useGenerations = (filter: string) =>
  useSWR<{ generations: Generation[] }>(`/api/generations?filter=${filter}&limit=60`, fetcher, {
    refreshInterval: (d) => (d?.generations.some((g) => isActive(g.status)) ? CLIENT.pollMs : 0),
  });

// use-campaign.ts
export const useCampaign = (id: string) =>
  useSWR<CampaignView>(`/api/campaigns/${id}`, fetcher, {
    refreshInterval: (d) =>
      d && (d.campaign.conceptsStatus === "generating" ||
            d.concepts.some((c) => (c.latest && isActive(c.latest.status)) || (c.final && isActive(c.final.status))))
        ? CLIENT.pollMs : 0,
  });
```
Do not import `config/limits.ts` into client code (it reads env). Client code uses `config/client.ts`:
```ts
export const CLIENT = { pollMs: 3000 };
```

After any credit-spending call succeeds: `mutate("/api/workspace")` and revalidate the relevant list or campaign.

---

## 14. UI specification

### 14.1 Visual direction
This is a clone: **match Higgsfield's live site.** Before building UI, take screenshots of its home, preset gallery and create screen, and extract: background and surface colors, accent color, font family, corner radius, card aspect ratios, nav layout. Put them into CSS variables in `app/globals.css` and the Tailwind theme:

```css
:root {
  --bg: #000000;        /* replace from screenshots */
  --surface: #121212;
  --surface-2: #1c1c1c;
  --border: #2a2a2a;
  --text: #f5f5f5;
  --muted: #9a9a9a;
  --accent: #d1fe17;    /* replace with the exact accent */
  --accent-text: #000000;
  --danger: #ff5a5f;
  --warning: #f5b83d;
  --success: #3ddc84;
  --radius: 14px;
}
```
Use the product's own name and logo, not Higgsfield's. Do not reuse Higgsfield's preview media.

Motion: only in response to actions (card flips from loading to video, dialog open, toast). No decorative entrance animations. Respect `prefers-reduced-motion`.

Copy: sentence case, plain verbs, no em dashes, the same word for the same action everywhere (button "Approve" → toast "Approved").

### 14.2 Shared components (`components/`)

**`shell/TopNav`**: left logo (links to `/`), links Explore, Create, Campaigns (with a small "New" badge), Library; active link highlighted. Right: `CreditsPill`. On narrow screens the links scroll horizontally.

**`shell/CreditsPill`**: lightning icon + "{n} credits". Tooltip: "Demo credits. Every visitor starts with 300." Uses `useWorkspace`.

**`ui/CostButton`**: props `label, cost, onClick, loading?, variant?`. Renders "{label} · {cost} credits". If `credits < cost` → disabled with tooltip "Not enough credits". Loading shows a spinner and keeps its width.

**`video/VideoPlayer`**: props `src, aspect, mode: "hover" | "autoplay" | "controls", caption?, showCaption?`. Always `muted playsInline loop`. `hover`: play on pointer enter, pause and reset on leave. `autoplay`: play only while in the viewport (IntersectionObserver). Caption overlay: bottom 25 percent, centered, bold white text with a dark text shadow, max 2 lines, TikTok style. Relative `src` works as is.

**`video/GenerationCard`**: props `generation, mode, caption?, onSelect?, selected?`.
- `queued`: skeleton at the right aspect + "In queue · 0:04"
- `running`: skeleton with subtle shimmer + "Generating · 0:18" (elapsed from `createdAt`, ticking each second)
- `done`: `VideoPlayer`; a small "Pro" badge if `tier="final"`
- `failed`: the error text, "Credits refunded", and a "Try again" button (POST retry)

**`explore/PresetCard`**: 3:4 card, looping preview from `/previews/{key}.mp4` in hover mode; if the file fails to load, show a gradient using the accent plus the preset name large. Name and one-line description below. Whole card is a link to `/create?preset={key}`.

**`create/PresetPicker`**: shows the current preset as a compact row (thumbnail, name, "Change"). "Change" opens a dialog with category tabs and a grid of `PresetCard`s; clicking one selects it and closes. A "No preset" option exists.

**`create/ImageDropzone`**: props `value: string | null, onChange(url | null), fitAspect?`. Accepts drag and drop, click to browse, and paste. On file: `resizeImage` → `POST /api/upload` as FormData → `onChange(url)`. Shows an uploading state, then a thumbnail with a remove button. Errors toast.

**`campaign/Stepper`**: steps Brief, Hooks, Review, Export. Completed steps show a check. Review shows a count badge of `needsReview`; Export shows `approved`. Clicking a step sets `?step=`. Brief opens a read-only drawer of the brief.

**`campaign/ScorePill`**: "{label} {n}/5", color by score: 4 to 5 success, 3 warning, 1 to 2 danger.

**`campaign/NoteDialog`**: textarea "What should change?", a checkbox (checked by default) "Include the reviewer's suggestion: {suggestedFix}", and `CostButton` "Regenerate". If unchecked and the note is empty, the button is disabled with the hint "Add a note or include the suggestion".

**`shell/EmptyState`**: icon, one line of text, one primary button.

### 14.3 Pages

**Explore `/`**
```
┌ TopNav ────────────────────────────────────────────────────────┐
│ Headline: "Turn one photo into scroll-stopping video"          │
│ Subline:  one sentence about presets and campaigns             │
│ [ Create a video ]  [ Start a campaign ]                       │
├────────────────────────────────────────────────────────────────┤
│ Tabs: All | Camera | Effects | UGC                             │
│ ▢ ▢ ▢ ▢                                                        │
│ ▢ ▢ ▢ ▢     PresetCard grid: 2 cols mobile, 3 md, 4 lg         │
└────────────────────────────────────────────────────────────────┘
```

**Create `/create`**
```
┌ Controls 360px (sticky) ─────┐┌ Canvas ─────────────────────────────┐
│ PresetPicker                 ││  Selected generation, large          │
│ ImageDropzone                ││  (GenerationCard, mode "controls")   │
│ Prompt            [Enhance]  ││                                      │
│ ┌──────────────────────────┐ ││ [Download] [Remix] [Use in campaign] │
│ └──────────────────────────┘ ││                  [Render in Pro · 25]│
│ Model   (Fast 10 | Pro 25)   │├──────────────────────────────────────┤
│ Aspect  (9:16 | 16:9 | 1:1)  ││ Recent: ▢ ▢ ▢ ▢ ▢ ▢  (horizontal)     │
│ Length  (5s)                 ││                                      │
│ [ Generate · 10 credits ]    ││                                      │
└──────────────────────────────┘└──────────────────────────────────────┘
```
- State: `presetKey`, `imageUrl`, `prompt`, `modelKey`, `aspect`, `duration`, `selectedId`.
- `?preset=` sets the preset (and its default aspect). `?from=` loads that generation (`GET /api/generations/:id`) and prefills preset, image, prompt, model, aspect.
- Prompt placeholder = preset's `placeholder`. "Enhance" calls `/api/prompt/enhance`, replaces the text, and shows a toast with "Undo".
- Model control shows each model's cost. Switching model clamps aspect and duration to what it supports.
- Generate: `POST /api/generate` → select the new generation → revalidate recent list and credits. Ctrl/Cmd + Enter also generates.
- Canvas empty state: "Your video will appear here" plus the current preset's preview.
- Recent strip: `useGenerations("create")`, first 20, click selects.
- Actions on the selected done clip: Download (`downloadVideo`), Remix (loads its settings into the panel), Use in campaign (`/campaigns/new?image={inputImageUrl}`; disabled with tooltip "Needs a clip made from a photo" when no image), Render in Pro (only for done drafts; after success select the new one).
- Below `lg`: controls stack above the canvas, and a sticky bottom bar holds the Generate button.

**Library `/library`**
- Header "Library" with tabs All, Drafts, Pro renders, Campaigns (`all | draft | final | campaign`).
- Grid of `GenerationCard` in hover mode: 2 cols mobile, 3 md, 5 xl.
- Click a done card → Dialog: large player on the left; on the right the prompt, preset name, model, time, cost; actions Download, Remix (`/create?from=id`), Use in campaign, Render in Pro.
- Empty state: "No videos yet" + "Create your first video" → `/create`.

**Campaign list `/campaigns`**
- Header "Campaigns" with primary "New campaign" top right.
- Cards: product photo, name, date, "{approved} approved of {concepts}". Click → `/campaigns/[id]`.
- Empty state: "Brief once, get several native video hooks, review them fast." + "Start a campaign".

**New campaign `/campaigns/new`**
Single column, max width about 640px. Top right link: "Use an example brief" (fills a realistic sample, e.g. a habit tracker app for students, with no photo).
Fields in order:
1. Product name (input)
2. What it is (textarea, 2 rows, one or two sentences)
3. Product photo (`ImageDropzone` with `fitAspect: "9:16"`, label "Recommended: videos will start from this photo"). `?image=` prefills it.
4. Audience (input, placeholder "Students who keep dropping new habits")
5. Goal (segmented: Awareness, App installs, Sales, Engagement)
6. Platform (segmented: TikTok, Reels, Shorts)
7. Tone (single-select chips: Funny, Relatable, Aspirational, Educational, Chaotic)
8. Number of variants (stepper 3 to 6, default 4) with hint "Drafts cost about {n × fast cost} credits"

Bottom right: primary "Write hooks" (no cost, writing hooks is free). On submit: `POST /api/campaigns` → `router.push("/campaigns/{id}?step=hooks")`. Inline validation messages under fields.

**Campaign `/campaigns/[id]`**
Header: product thumbnail, campaign name, `Stepper`. Default step: `?step=` if present, else derived (architecture section 4). On load, if `conceptsStatus === "idle"` and there are no concepts, call `POST /api/campaigns/:id/concepts` once (guard with a ref).

*Hooks step*
- `generating`: skeleton concept cards (count = `conceptCount`) and "Writing hooks for {productName}".
- `failed`: "Could not write hooks." + "Try again".
- `ready`: grid (1 col mobile, 2 md, 3 lg) of `ConceptCard`:
  - top row: checkbox (selected), hook type badge (label from `HOOK_TYPES`), re-roll icon button (tooltip "Write a different hook")
  - hook line: large text, click to edit, saves on blur (`PATCH`)
  - "What the video shows": textarea clamped to 3 lines with "Show more"
  - preset: small select of preset names
  - caption: editable, with character count
  - a concept that already has a video shows a "Has video" badge, is read-only, and its checkbox is hidden
- Header right, secondary: "Rewrite hooks" (confirm dialog: "Hooks without videos will be replaced.")
- Sticky bottom bar right: `CostButton` "Generate {k} drafts" where k = selected concepts without videos. Disabled at 0 with hint "Select at least one hook". On success → `?step=review`.

*Review step*
- Tabs: Needs review ({n}, includes generating cards first), Approved, Rejected. Header right: "Captions" toggle (default on).
- Grid (1 col mobile, 2 md, 3 lg, 4 xl) of `ReviewCard`:
  - `GenerationCard` in autoplay mode with caption = concept `hookLine`
  - version switcher "v2 of 2" with arrows when `versions.length > 1`; older versions are view-only
  - review area:
    - `aiReviewStatus none/pending`: four skeleton pills + "Reviewing"
    - `done`: four `ScorePill`s + overall; "Why" expands the four reasons; "Suggested fix: ..." line
    - `failed` (or failed locally): "Review unavailable" + "Retry review"
  - actions: Approve (A), Reject (R), Fix and regenerate (F, opens `NoteDialog`); after a decision the card shows an Approved or Rejected badge with "Undo"
- Trigger reviews: when a card's latest version is `done` and `aiReviewStatus === "none"`, call `enqueueReview(id, outputUrl, () => mutate())`.
- Keyboard: a focused-card index; arrow keys move focus (visible ring); A approves, R rejects, F opens the dialog. Ignore keys while typing in an input or while a dialog is open. A hint bar at the bottom: "A approve / R reject / F fix / arrows move".
- When nothing is left in Needs review: banner "All clips reviewed. {approved} approved." + "Go to export".
- Toasts: "Approved", "Rejected", "Regenerating".

*Export step*
- List rows for concepts whose latest draft is approved: thumbnail (hover play), hook line, caption with "Copy caption", Pro status:
  - no final: `CostButton` "Render in Pro"
  - final active: "Rendering · 0:21"
  - final done: "Pro" badge, player on click
  - final failed: error + "Try again"
- Download buttons: "Download draft", "Download Pro" (when done). Filenames `{product}-{hookType}-{draft|pro}.mp4`.
- Header right: `CostButton` "Render all in Pro" for approved concepts without a final (calls finalize for each, sequentially, stopping on the first error with a toast).
- Empty: "No approved clips yet" + "Go to review".

---

## 15. Agent-ready file (P2): `public/llms.txt`
```
# Hookline
> AI video studio with presets and a Campaign mode for short-form organic video.

Hookline turns a photo or prompt into a short video using visual presets, and turns one brand brief into several native-feeling video hooks with AI pre-review and human approval.

## Pages
- /: preset gallery
- /create: make a single video
- /campaigns/new: start a campaign from a brief
- /library: all videos in this workspace

## JSON API (cookie-scoped workspace, created automatically on first request)
- POST /api/generate: start a video
- GET /api/generations/{id}: poll status
- POST /api/campaigns: create a campaign from a brief
- POST /api/campaigns/{id}/concepts: write hooks
- POST /api/campaigns/{id}/generate: generate drafts
- GET /api/campaigns/{id}: full campaign state
```

---

## 16. README outline (write at the end)
1. What it is (one paragraph) and the live link
2. Why Campaign mode: one sentence tying it to how 8x works
3. Feature list with short GIFs or screenshots
4. Architecture diagram (copy section 1 of `architecture.md`) and key decisions table
5. How AI was used to build it, honestly
6. Tradeoffs and what was cut
7. What I would build next: the view-tracking feedback loop, burned-in captions and audio, brand sign-off sharing
8. Running locally: env vars, `npm run db:push`, `npm run dev`, `ENGINE_MODE=mock`

---

## 17. Final QA checklist (on the production URL, in a fresh incognito window)

- [ ] First visit gets 300 credits, no sign-up
- [ ] Every Explore card opens Create with the right preset
- [ ] Create: text-only and photo generations both finish and play
- [ ] Credits drop by the shown cost; a forced failure (`[fail]` in mock, or a bad input) refunds
- [ ] Refreshing mid-generation keeps progress
- [ ] Render in Pro works from Create and Library
- [ ] Campaign with example brief: hooks appear, edit and re-roll work
- [ ] Batch generate, all cards resolve, AI reviews appear with sensible scores
- [ ] Approve, reject, undo, fix and regenerate (new version appears, switcher works)
- [ ] Keyboard shortcuts work and do not fire while typing
- [ ] Export: render all in Pro, download, copy caption
- [ ] No dead buttons, no blank screens, every error has a message
- [ ] Phone width: every main button reachable, nothing overflows
- [ ] No em dashes anywhere in the UI copy
- [ ] fal dashboard spend so far is under $8, leaving the rest for reviewers
- [ ] Production env has `ENGINE_MODE=fal`, `MAX_DAILY_GENERATIONS=60`, and audio is off in `config/models.ts`

---

## 18. Build plan

### Hour 0 to 1: lead (you)
Read the brief and adjust scope if it asks for something specific. Freeze `lib/types.ts`, all `config/*` files (real model IDs filled in), `lib/api.ts`. Commit. Then start the tracks.

### Track A: engine and API
| Task | Scope | Done when |
|---|---|---|
| A0 | `scripts/fal-smoke.ts` (4.7); fix `config/models.ts` from its output | all three smoke cases print a URL; cost per clip confirmed; mock samples saved |
| A1 | Setup (section 2), schema, db client, `db:push` | tables exist |
| A2 | errors, workspace, middleware, `GET /api/workspace` | new incognito visit returns 300 credits and a ledger row exists |
| A3 | engine types, mock, fal, index; `POST /api/upload` | upload returns a URL; mock and fal both submit |
| A4 | credits, generations service; generate, list, get, retry, finalize routes | mock generation goes queued → running → done via polling; `[fail]` refunds exactly once |
| A5 | campaigns service and routes (without AI: stub `generateConcepts` returning fixed data until D2 lands) | full campaign view JSON works with mock |
| A6 | review, decision, regenerate, enhance routes (use D's functions) | routes return correct errors for wrong states |
| A7 | `/api/media` | proxied video plays and can be captured |

### Track B: clone UI (works in mock mode)
| Task | Scope | Done when |
|---|---|---|
| B1 | globals.css tokens from screenshots, AppShell, TopNav, CreditsPill | shell matches the reference look |
| B2 | CostButton, VideoPlayer, GenerationCard, EmptyState, PresetCard | all four generation states render; **do this first, Track C depends on it** |
| B3 | Explore | cards link correctly, previews fall back to gradients |
| B4 | Create (PresetPicker, ImageDropzone, prompt, model, aspect, length, canvas, recent strip, actions) | journey 1 from product.md works in mock |
| B5 | Library with dialog | filters and actions work |
| B6 | Phone layout pass on all clone pages | QA phone item passes |

### Track C: campaign UI (works in mock mode)
| Task | Scope | Done when |
|---|---|---|
| C1 | Campaign list, New campaign form with example brief | creating redirects to hooks step |
| C2 | Campaign page shell, Stepper, Hooks step, ConceptCard | edit, select, re-roll, generate batch work |
| C3 | Review step without AI: ReviewCard, tabs, decisions, undo, version switcher, NoteDialog | approve, reject, regenerate work |
| C4 | `lib/media/*`, review queue, AI review display | reviews appear automatically on finished clips |
| C5 | Export step | render all, download, copy caption work |
| C6 | Keyboard shortcuts and focus ring | QA keyboard item passes |

### Track D: AI
| Task | Scope | Done when |
|---|---|---|
| D1 | `lib/ai/client.ts` | a test script gets valid JSON with and without an image |
| D2 | `generateConcepts` | 4 distinct concepts, valid preset keys, for 3 different sample briefs |
| D3 | `reviewClip` | scores vary sensibly between a good and a bad clip |
| D4 | `rewritePrompt`, `enhancePrompt` | outputs respect the word limits and rules |
| D5 | Prompt tuning on real fal output | at least one full campaign looks good end to end |

### Timeline
| Hours | Work |
|---|---|
| 0 to 1 | Lead freezes contracts (A0 smoke test should already be done before the clock starts) |
| 1 to 4 | A1 to A3, B1 to B2, C1, D1 to D2 |
| 4 to 7 | A4 to A5, B3 to B4, C2, D3 |
| 7 to 12 | A6 to A7, B5, C3 to C4, D4; switch to `ENGINE_MODE=fal` and run journey 2 for real |
| 12 to 15 | C5 to C6, B6, D5, run `scripts/gen-previews.ts` (4.8) once |
| 15 to 18 | P2 items (llms.txt), polish copy and empty states |
| 18 to 21 | QA checklist on production, fix bugs |
| 21 to 24 | README, walkthrough video, buffer |
