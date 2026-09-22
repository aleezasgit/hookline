# Hookline

A Higgsfield AI clone (presets, create, library, credits) with a Campaign mode on top: brief once, get several AI-generated video hooks, get an AI pre-review on each, approve or reject as a human, render the winners in Pro quality.

Live link: not yet deployed. Run locally with the steps below.

## Why Campaign mode

8x runs creator networks: it briefs creators, reviews what they post, and keeps the winners. Campaign mode compresses that exact workflow into one screen flow: brief, generate several variants, review fast with AI assistance, keep what works.

## Features

**Clone core**
- Explore: a gallery of visual presets (camera moves, effects, UGC styles) grouped into categories, each with a looping preview
- Create: turn a photo or a prompt into a short video with a chosen preset, model tier and aspect ratio
- Library: every video generated in the workspace, filterable by draft, Pro render or campaign clip
- Credits: 300 demo credits per visitor, no sign-up, every spending action shows its cost up front and refunds automatically on failure

**Campaign mode**
- Brief: product, audience, goal, platform, tone and how many hook variants to write
- Hooks: AI writes several distinct concepts (hook type, opening line, what the video shows, preset, caption); edit, re-roll, or deselect any of them before spending credits
- Review: a review board where clips turn from loading placeholders into playing videos as they finish, each scored by AI on hook strength, native feel, on-brief fit and visual quality, with a one-line reason per score and a suggested fix; approve, reject, or fix-and-regenerate with a note; full keyboard shortcuts (A approve, R reject, F fix, arrow keys to move)
- Export: render approved clips in Pro quality, individually or in bulk, download or copy the caption

## Architecture

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
  ├─ ai            Groq: hooks/rewrite/enhance (gpt-oss-120b), review/photo-led hooks (qwen3.8-27b)
  └─ engine        the ONLY code that talks to the video provider
        ├─ FalProvider   (real)
        └─ MockProvider  (fake, zero cost)
  ▼
Postgres (via Drizzle)              6 tables
```

Key decisions:

| Decision | Why |
|---|---|
| No auth. A cookie `ws_id` maps to a workspace row with demo credits. | Zero sign-up friction for reviewers. Every visitor gets an isolated sandbox. |
| Engine behind a `VideoProvider` interface with a mock implementation. | UI work never waits on, or pays for, real generation. Fal-specific details live in one place. |
| Models, presets and rubric live in config files. | Adding a preset or swapping a model is data, not code. |
| One video model for both tiers (Seedance 1.5 Pro), tiers differ only by resolution, audio off. | The whole fal budget is $15. One model means one input schema and fewer bugs. |
| Polling on read instead of webhooks. | No public webhook URL, no background workers, survives page refresh. |
| Credits are charged up front and refunded on failure, with a ledger. | Prevents overspending, keeps the balance honest, every credit movement is auditable. |

## How AI was used to build it

This was built with Claude Code (Sonnet 5) driving the whole implementation from `product.md`, `architecture.md` and `implementation.md`. The workflow:

1. Scaffolded the Next.js app, then built the backend foundation myself: shared types, config, the Drizzle schema, the mock/fal engine, the credits and generations services, the Groq AI layer, and every API route. Verified it end to end against a real local Postgres (spun up in Docker) and the real Groq API before touching any UI: a mock generation going queued to running to done, a forced failure refunding credits, and a full campaign (brief, AI-written hooks, batch draft generation) all worked via direct API calls.
2. Delegated the two UI halves (Explore/Create/Library, and Campaign mode) to two subagents working in parallel against the now-stable backend and shared component contracts, each scoped to its own files per the architecture doc's ownership table.
3. Ran a real, automated QA pass with a headless browser (Playwright): screenshotted every page at desktop and 375px width, checked for console errors, and exercised the actual flows (create a video, batch generate a campaign, approve/reject/retry clips, keyboard shortcuts). This caught real bugs before a human ever had to:
   - A hydration race where a video's load error could fire before React attached its error handler, silently losing the "preview unavailable" fallback state.
   - A tight per-minute output-token quota on the Groq account that made concept generation for a full 6-hook batch fail outright; fixed by asking for only as many tokens as each call type actually needs, plus a retry on transient upstream errors.
   - A campaign draft whose only generation failed (timed out) had nowhere to live on the review board and silently vanished from every tab and count.
   - The retry button on any failed clip never refreshed the page it was shown on, so a successful retry looked like nothing happened.
   - A duplicated "Credits refunded" phrase when the server error already included it.
4. Ran the one-time `fal-smoke.ts` script against the real Seedance API to verify field names and save real sample clips, and `gen-previews.ts` for the Explore page's preset previews, both real spends confirmed with the person running this before they ran.
5. Ran a full hardening pass afterward (stuck states, double-click and race safety, AI reliability, input validation, error boundaries, fault injection, an automated service and browser test suite, and an AI quality check script) against `docs/hardening.md`. Details and what changed in `docs/hardening-report.md`.

## Tradeoffs and what was cut

- No image generation, no video editor or timeline, no posting to social platforms, no team accounts. All explicitly out of scope per `product.md`.
- The Explore preset previews and mock sample clips are real Seedance output, but generated from a generic test prompt and a random stock photo rather than curated per preset; they're representative, not polished marketing assets.
- Library and Create's "Render in Pro" don't try to auto-select the freshly rendered clip in every filter context (e.g. from the Drafts tab), since the new render may not be visible in the active filter; it shows a toast pointing at the right tab instead of risking a confusing silent no-op.

## What I would build next

- Paste the link of a posted TikTok and track its real views, so the system learns which hooks and presets actually win, closing the loop the AI pre-review can only approximate today.
- Burned-in captions and audio on the rendered clips themselves, not just as an overlay in the review UI.
- Team accounts and sharing a campaign with a brand for sign-off, without adding full auth.

## Running locally

```bash
npm install
npm run db:push    # apply the schema to your DATABASE_URL
npm run dev
```

Environment variables (`.env.local`, never committed):

```
FAL_KEY=
GROQ_API_KEY=
DATABASE_URL=
DATABASE_URL_TEST=          # a separate database, only needed to run `npm test`
ENGINE_MODE=mock            # mock | fal
INITIAL_CREDITS=300
MAX_DAILY_GENERATIONS=60
```

Build in `ENGINE_MODE=mock` (the default): video generation is simulated with no fal spend, using the real sample clips already checked in under `public/mock`. Switch to `ENGINE_MODE=fal` only for real generations, and expect real cost per the model table in `config/models.ts`.

```bash
npm run build       # must pass with no type errors
npm run lint
npx tsx scripts/fal-smoke.ts     # once, verifies the video model (already run, ~$0.40 spent)
npx tsx scripts/gen-previews.ts  # once, Explore previews (already run, ~$1.45 spent)
```

## Testing

```bash
npm test                          # vitest: service tests against a real Postgres test DB, mock engine only
npm run test:e2e                  # Playwright: full browser flows, desktop + 375px phone, mock engine only
npx tsx --tsconfig scripts/tsconfig.eval.json scripts/ai-eval.ts   # Groq-only AI quality check, no fal, no credits
```

`npm test` needs `DATABASE_URL_TEST` set (a separate database from the dev one; `tests/global-setup.ts` pushes the schema and truncates it before each run). `npm run test:e2e` needs the dev server reachable at `localhost:3002` (it starts one if none is running) and runs against real Groq calls for the one campaign journey that writes hooks, so it isn't fully free, but never touches fal.

Service tests cover: credits never double-charge or under-refund under concurrent load, idempotency keys and partial unique indexes make retries and double clicks safe, stale hooks/review locks get reclaimed, campaign batches are all-or-nothing on credits, and every cross-workspace read or write is rejected. Browser tests cover: the three main journeys end to end, a forced failure shows an error and refunds credits, double clicks and keyboard shortcuts behave, a mid-generation refresh and two open tabs both stay consistent, no page scrolls horizontally or hides its primary action at 375px, and axe-core finds no serious or critical accessibility violations on any page.

Development-only fault injection (`config/limits.ts`'s `FAULTS`, ignored when `NODE_ENV=production`) makes every failure path testable without spending real money or waiting out a real timeout. Set in `.env.local`, restart the dev server:

| Variable | Effect |
|---|---|
| `MOCK_FAIL_RATE` | 0 to 1. That fraction of mock generations end `failed` instead of `done` (deterministic per generation, not re-rolled each poll). |
| `MOCK_SUBMIT_FAIL=1` | Every mock generation fails immediately at submit, refunded the same way a real submit failure is. |
| `MOCK_DELAY_MS` | Overrides the mock provider's normal 12 second run time, e.g. `700000` to exercise the 10 minute timeout path without actually waiting 10 minutes. |
| `AI_FAULT` | `rate_limit` \| `bad_json` \| `timeout` \| `down`. Makes `aiJson` simulate that failure before ever calling Groq: the first three surface "The AI is busy right now. Try again in a minute.", `bad_json` runs the real schema-retry loop against unparsable content and surfaces "The AI returned an unexpected response. Try again." |

`[fail]` anywhere in a Create-page prompt also makes that one mock generation fail, independent of `MOCK_FAIL_RATE`.
