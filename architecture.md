# Hookline: Architecture (MVP)

Read `product.md` first for the what and why. This document is the shape of the system. `implementation.md` has the exact code-level instructions.

## 1. System at a glance

```
Browser (Next.js client components)
  │  Explore · Create · Library · Campaigns
  │  also runs: image resize, video frame capture, polling
  ▼
API routes (/app/api/**)            thin: parse, validate, call services, return JSON
  ▼
Services (/lib/*)                   business logic
  ├─ generations   create, refresh, finalize, regenerate, decide
  ├─ campaigns     brief, concepts, batch, view model
  ├─ credits       charge, refund, ledger
  ├─ workspace     cookie → workspace row
  ├─ ai            Groq (Qwen 3.8 27B): hooks, review, rewrite, enhance
  └─ engine        the ONLY code that talks to the video provider
        ├─ FalProvider   (real)
        └─ MockProvider  (fake, zero cost)
  ▼
Postgres (via Drizzle)              5 tables
```

External services, and nothing else:
- **fal.ai**: video generation (Seedance 1.5 Pro, audio off: 480p for Fast, 720p for Pro) and image upload storage.
- **Groq**: `qwen/qwen3.8-27b` for all text and vision AI.
- **Postgres**: any Postgres reachable by `DATABASE_URL`.

## 2. Key decisions and why

| Decision | Why |
|---|---|
| **No auth. A cookie `ws_id` maps to a workspace row with demo credits.** | Zero sign-up friction for reviewers. Every visitor gets an isolated sandbox. Saves hours. |
| **Engine behind a `VideoProvider` interface with a Mock implementation.** | UI work never waits on, or pays for, real generation. Fal-specific details live in one place. Mock doubles as an outage fallback. |
| **Models, presets and rubric live in config files.** | Adding a preset or swapping a model is data, not code. Fal model IDs and input schemas change often, so they are isolated. |
| **One video model for both tiers (Seedance 1.5 Pro), tiers differ only by resolution, audio off.** | The whole budget is $15. Fast drafts cost about $0.06 and Pro about $0.13, so there is room for full testing plus reviewers. One model means one input schema and fewer bugs. |
| **Polling on read instead of webhooks.** | The status route asks the provider for progress when the client polls. No public webhook URL, no background workers, survives page refresh, parallel batches are free. |
| **All fal calls happen on the server.** | The key never reaches the browser. No client proxy needed. |
| **Frame capture happens in the browser.** | No ffmpeg on the server. The browser loads the finished video as a blob, grabs 4 frames on a canvas, sends small JPEGs to the review route. |
| **One AI model for text and vision (Qwen 3.8 27B on Groq), instruct mode, JSON output validated with zod.** | One client, one prompt style, fast responses. Validation plus one retry makes LLM output safe to render. |
| **Credits are charged up front and refunded on failure, with a ledger.** | Prevents overspending, keeps the balance honest, and every credit movement is auditable. |
| **AI review and human decision are stored on the generation row.** | Fewer tables and joins. One generation has at most one review and one decision. |
| **One "view model" endpoint for a campaign.** | The review board fetches one JSON payload and polls it. The UI stays dumb. |

## 3. Data model

Five tables. All IDs are UUIDs. All timestamps are `timestamptz`.

```
workspaces 1───* campaigns 1───* concepts
     │                │              │
     │                └──────*───────┤
     └──────────* generations *──────┘      (campaign_id, concept_id nullable)
     │                 │
     │                 └── parent_id → generations (versions and Pro renders)
     └──────────* credit_ledger
```

### workspaces
| field | meaning |
|---|---|
| id | equals the `ws_id` cookie value |
| credits | current balance (int) |
| created_at | |

### campaigns
| field | meaning |
|---|---|
| id, workspace_id | |
| name | defaults to the product name |
| brief | JSON: productName, productDescription, productImageUrl?, audience, goal, platform, tone, conceptCount |
| concepts_status | `idle` · `generating` · `ready` · `failed` |
| created_at | |

### concepts
| field | meaning |
|---|---|
| id, campaign_id | |
| position | display order |
| hook_type | one of the hook type keys |
| hook_line | opening line, shown as caption overlay |
| visual_prompt | what the video shows (one continuous 5s shot) |
| preset_key | a key from `config/presets.ts` |
| caption | post caption with hashtags |
| selected | boolean, include in the batch |
| created_at | |

### generations
| field | meaning |
|---|---|
| id, workspace_id | |
| campaign_id, concept_id | null for Create-page clips |
| parent_id | previous version, or the draft a Pro render came from |
| tier | `draft` · `final` |
| model_key | key from `config/models.ts` |
| preset_key | nullable |
| prompt | what the user typed, or the concept's visual prompt |
| composed_prompt | exactly what was sent to the model |
| input_image_url | nullable |
| aspect, duration | e.g. `9:16`, `5` |
| status | `queued` · `running` · `done` · `failed` |
| provider | `fal` · `mock` (fixed at creation) |
| provider_endpoint, provider_request_id | needed to poll the provider |
| output_url, error | |
| cost | credits charged |
| ai_review_status | `none` · `pending` · `done` · `failed` |
| ai_review | JSON, see AiReview below |
| decision | `pending` · `approved` · `rejected` |
| decision_note | |
| created_at, completed_at | |

### credit_ledger
| field | meaning |
|---|---|
| id, workspace_id | |
| delta | negative for charges, positive for grants and refunds |
| reason | `initial` · `generation` · `refund` |
| generation_id | nullable |
| created_at | |

### AiReview JSON
```
{
  scores:  { hook: 1-5, native: 1-5, onBrief: 1-5, quality: 1-5 },
  reasons: { hook: string, native: string, onBrief: string, quality: string },
  overall: number (average, 1 decimal),
  verdict: "strong" | "okay" | "weak",
  suggestedFix: string
}
```

## 4. State machines

**Generation status**
```
(create) → queued ──provider accepts──▶ running ──result ok──▶ done
              │                            │
              └──────────── error / no output / 10 min timeout ──▶ failed (refund once)
```
- The transition to `failed` is a conditional update (`WHERE status IN ('queued','running')`). Only the call that wins the update issues the refund, so double refunds are impossible.
- Network errors while polling do not fail a generation. It just stays in its current state until the next poll.

**AI review status** (campaign drafts only)
```
none ──client posts frames (conditional update)──▶ pending ──▶ done
                                                         └──▶ failed (retry allowed → pending)
```

**Human decision**: `pending ⇄ approved ⇄ rejected`. Any value can change to any other (undo is allowed).

**Campaign step** (derived on the client, never stored)
- no concepts, or none generated yet → **Hooks**
- at least one generation exists → **Review**
- the user can always open **Export**; it lists approved concepts

## 5. Core flows

### A. Create a video (clone)
1. Client resizes the image (if any) and `POST /api/upload` → fal storage URL.
2. Client `POST /api/generate` with preset, model, prompt, image, aspect, duration.
3. Service checks limits → charges credits and inserts the generation (`queued`) in one transaction → submits to the provider → saves the request ID.
4. If the submit throws → mark `failed`, refund.
5. Client polls `GET /api/generations/:id` every 3s. The route calls `refreshGeneration`, which asks the provider for status while active.
6. On `done` the canvas plays `output_url`; history and credits revalidate.

### B. Campaign: brief to hooks
1. `POST /api/campaigns` with the brief → campaign row, `concepts_status=idle`.
2. Client immediately `POST /api/campaigns/:id/concepts`. Service sets `generating`, calls the AI with the brief and the list of allowed presets, validates, replaces any concepts that have no generations yet, sets `ready`.
3. User edits (`PATCH /api/concepts/:id`), re-rolls one (`POST /api/concepts/:id/reroll`), toggles `selected`.

### C. Campaign: batch generate
1. `POST /api/campaigns/:id/generate`.
2. For each selected concept without a generation: composed prompt = `visual_prompt + preset.styleSuffix`, model = Fast, aspect 9:16, duration 5, input image = product image if present.
3. Capacity and credits are checked for the whole batch first. All or nothing.
4. Each goes through the same `createGeneration` service as flow A.

### D. Review board loop
1. Client polls `GET /api/campaigns/:id` (the view model) every 3s while anything is active. The route refreshes active generations before assembling.
2. When a card's latest version is `done` and `ai_review_status=none`, the client queues it in a review queue (max 2 at a time): fetch the video as a blob → capture frames at 0.5s, 1.5s, middle, end → `POST /api/generations/:id/review`.
3. The route flips `none → pending` (conditional; a loser gets 409 and stops), loads the brief and concept, calls the AI with the 4 frames, saves the review.
4. Human presses A, R or F. `PATCH /api/generations/:id/decision` or `POST /api/generations/:id/regenerate`.

### E. Fix and regenerate
1. Input: the old generation, the human note (optional), and the AI's suggested fix.
2. AI rewrites the visual prompt (human note wins over the AI fix).
3. New draft generation, same concept, `parent_id` = old one. It becomes the latest version. The old one stays in the version list.

### F. Render in Pro
1. `POST /api/generations/:id/finalize` on a `done` draft.
2. New generation: `tier=final`, Pro model, same composed prompt, image and aspect, `parent_id` = the draft.
3. Export shows the concept's latest final next to its approved draft.

## 6. API surface

All responses are JSON. Errors are always `{ "error": { "code": string, "message": string } }`.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/workspace | balance |
| POST | /api/upload | image → URL |
| POST | /api/generate | start a Create-page generation |
| GET | /api/generations | list (filters), refreshes active ones |
| GET | /api/generations/:id | one, refreshed |
| POST | /api/generations/:id/retry | same inputs, new generation |
| POST | /api/generations/:id/finalize | Pro render |
| POST | /api/generations/:id/regenerate | new version with feedback |
| POST | /api/generations/:id/review | AI pre-review from frames |
| PATCH | /api/generations/:id/decision | approve, reject, reset |
| POST | /api/prompt/enhance | improve a prompt |
| GET | /api/campaigns | list |
| POST | /api/campaigns | create from brief |
| GET | /api/campaigns/:id | full view model |
| POST | /api/campaigns/:id/concepts | (re)write hooks |
| POST | /api/campaigns/:id/generate | batch drafts |
| PATCH | /api/concepts/:id | edit or toggle |
| POST | /api/concepts/:id/reroll | rewrite one concept |
| GET | /api/media | streamed video proxy (fallback for CORS) |

Error codes: `VALIDATION` 400, `NOT_FOUND` 404, `CONFLICT` 409, `INSUFFICIENT_CREDITS` 402, `TOO_MANY_ACTIVE` 429, `DAILY_CAP` 429, `AI_FAILED` 502, `PROVIDER_FAILED` 502.

## 7. Guardrails

- **Max 8 active generations per workspace** (queued or running). A campaign batch needs room for all of its items.
- **Global daily cap** (`MAX_DAILY_GENERATIONS`, max 60, counted across all workspaces since UTC midnight) protects the $15 fal balance. Worst case, 60 Pro renders cost about $8.
- **Upload size**: the browser resizes images to max 1536px JPEG before upload. The server rejects files above 4 MB.
- **Timeouts**: a generation active for more than 10 minutes becomes `failed` with a refund.
- **Media proxy**: only fetches from fal media hosts (allowlist). Never an open proxy.

## 8. Frontend structure

**Routes**
```
/                       Explore (home)
/create                 Create studio   (?preset=key, ?from=generationId)
/library                Library
/campaigns              Campaign list
/campaigns/new          Brief form      (?image=url to prefill)
/campaigns/[id]         Hooks · Review · Export (?step=hooks|review|export)
```

**Data fetching**
- SWR everywhere. The fetcher throws the API error object so components can show `message`.
- Polling uses SWR's `refreshInterval` as a function: 3000 ms while any item is `queued` or `running` (or concepts are `generating`), otherwise 0.
- After any mutation that spends credits, revalidate `/api/workspace`.

**Shared building blocks**
- `AppShell`, `TopNav`, `CreditsPill`
- `VideoPlayer` (9:16 aware, optional caption overlay, hover-to-play mode)
- `GenerationCard` (renders queued, running, done, failed states consistently)
- `CostButton` (primary button that always renders "Label · N credits" and disables with a reason when unaffordable)
- `PresetCard`, `PresetPicker`, `ImageDropzone`
- `Stepper`, `ConceptCard`, `ReviewCard`, `ScorePill`, `NoteDialog`, `EmptyState`
- Toasts via `sonner`

**Client-only helpers** (`/lib/media`)
- `resizeImage(file, { maxSize, fitAspect? })`
- `fetchVideoBlob(url)` (direct fetch, falls back to `/api/media`)
- `captureFrames(blob, times)` → JPEG data URLs
- `reviewQueue` (concurrency 2, de-duplicates by generation ID)

## 9. Folder structure

```
app/
  layout.tsx                    AppShell
  page.tsx                      Explore
  create/page.tsx
  library/page.tsx
  campaigns/page.tsx
  campaigns/new/page.tsx
  campaigns/[id]/page.tsx
  api/...                       one folder per route in section 6
components/
  shell/  video/  create/  explore/  library/  campaign/  ui/ (shadcn)
config/
  models.ts  presets.ts  hooks.ts  rubric.ts  ai.ts  limits.ts  client.ts
lib/
  db/schema.ts  db/index.ts
  workspace.ts  credits.ts  errors.ts  types.ts  prompt.ts  api.ts
  engine/types.ts  engine/fal.ts  engine/mock.ts  engine/index.ts
  generations.ts  campaigns.ts
  ai/client.ts  ai/concepts.ts  ai/review.ts  ai/rewrite.ts  ai/enhance.ts
  media/resize.ts  media/frames.ts  media/fetch.ts  media/review-queue.ts
  hooks/use-workspace.ts  hooks/use-generations.ts  hooks/use-campaign.ts
middleware.ts                   (proxy.ts on Next 16+)
public/
  mock/sample-1.mp4 ... sample-3.mp4
  previews/<preset-key>.mp4
  llms.txt
```

## 10. Ownership boundaries (for parallel work)

| Area | Owns | Must not touch |
|---|---|---|
| Engine and API | `lib/**` except `lib/media` and `lib/hooks`, `app/api/**`, `config/models.ts`, `config/limits.ts` | pages, components |
| Clone UI | `app/page.tsx`, `app/create`, `app/library`, `components/{shell,video,create,explore,library}`, `config/presets.ts` | `lib/engine`, API routes |
| Campaign UI | `app/campaigns/**`, `components/campaign`, `lib/media`, `lib/hooks/use-campaign.ts` | `lib/engine`, API routes |
| AI prompts | `lib/ai/**`, `config/hooks.ts`, `config/rubric.ts`, `config/ai.ts` | everything else |

`lib/types.ts` is frozen after hour 1. Changing it requires telling every track.
