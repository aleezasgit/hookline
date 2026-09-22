# CLAUDE.md

## What we are building
Hookline: a Higgsfield AI clone (presets, create, library, credits) with a Campaign mode on top (brief → several video hooks → AI pre-review → human approve or reject → Pro render). Built in one day as the take-home for the Software Engineer role at 8x, a company that runs creator networks: briefs, volume, review, keep the winners.

## Read before coding
1. `docs/product.md`: what and why. The source of truth for behavior and copy.
2. `docs/implementation.md`: exact code-level instructions. Find your task in section 18.
3. `docs/architecture.md`: the system shape, if you need context.

If the docs and your instinct disagree, follow the docs. If the docs are silent, choose the simplest option that fits `product.md` and leave a `// NOTE:` comment.

## Priority order
The reviewer at 8x cares most about Campaign mode and about everything working. The clone must still look and feel like Higgsfield.
1. Nothing broken: no dead buttons, no blank screens, no unexplained errors
2. Campaign mode end to end
3. Clone fidelity (Explore, Create, Library)
4. Polish

Never start a P2 item while a P0 item in your track is unfinished.

## Golden rules
1. **Only `lib/engine/*` talks to fal.ai.** Everything else calls the generations service.
2. **Models, presets, hook types, rubric and AI settings live in `config/*`.** Never hardcode a model ID, cost, preset or prompt setting elsewhere.
3. **`lib/types.ts` is frozen.** Do not change a shared type without the lead's approval.
4. **Stay in your track's folders** (ownership table in `docs/architecture.md` section 10).
5. **No auth, no payments, no new services.** The workspace cookie is the only identity.
6. **Mock mode first.** Build and test with `ENGINE_MODE=mock`. Only the lead switches to `fal` for integration, because real generations cost money.
7. **Credits:** every action that spends credits goes through `createGeneration`, which charges up front and refunds on failure. Never touch `workspaces.credits` any other way.
8. **All LLM output is validated with zod** through `aiJson`. Never render raw model text as trusted data.
9. **Secrets stay on the server.** Files that use keys import `"server-only"`. Client code never imports `config/limits.ts`, `lib/engine`, `lib/ai` or `lib/db`.
10. **Don't add scope.** No features, pages or libraries that are not in the docs.

## Budget and model (hard rules)
- The total fal budget is **$15** for building, testing, the demo and reviewers. Treat real generations like cash.
- Video model: **Seedance 1.5 Pro on fal for both tiers, audio OFF.** Fast = 480p, Pro = 720p. Do not add, switch or upgrade models.
- Work in `ENGINE_MODE=mock`. Never switch to `fal` yourself unless your task explicitly says so (A0, integration, previews).
- The only code allowed to call fal outside the app is `scripts/fal-smoke.ts` and `scripts/gen-previews.ts`, each run once.
- No loops, retries or tests that call fal. A failed real generation means a wrong input: read the error, fix `config/models.ts`, then retry once.
- `MAX_DAILY_GENERATIONS` stays at 60 or below. `INITIAL_CREDITS` stays at 300 or below.
- Groq (Qwen) calls are cheap but still rate limited: no parallel bursts beyond the review queue's limit of 2.

## Stack
Next.js App Router + TypeScript (strict) + Tailwind + shadcn/ui, Drizzle + Postgres (`postgres` driver, `prepare: false`), `@fal-ai/client`, `groq-sdk` with `qwen/qwen3.8-27b`, SWR, zod, sonner, lucide-react.

## Commands
```
npm run dev        # local
npm run db:push    # apply schema changes
npm run build      # must pass before you say a task is done
npm run lint
npx tsx scripts/fal-smoke.ts     # once, verifies the video model (costs ~$0.40)
npx tsx scripts/gen-previews.ts  # once, Explore previews (costs ~$1.45, skips existing files)
```

## Environment
`FAL_KEY`, `GROQ_API_KEY`, `DATABASE_URL`, `ENGINE_MODE` (mock | fal), `INITIAL_CREDITS` (300), `MAX_DAILY_GENERATIONS` (60). In `.env.local`, never committed.

## Next.js gotchas
- Next 15+: `params` and `cookies()` are async. `const { id } = await params`.
- Next 16+: the middleware file is `proxy.ts` exporting `proxy`.
- Every API route: `export const runtime = "nodejs"` and the `route()` wrapper from `lib/errors.ts`. AI routes add `export const maxDuration = 60`.
- The app must run on a serverless host: no writing to the local filesystem, no background processes, no in-memory state shared between requests. Progress is driven by client polling.
- Keep request bodies small: images are resized in the browser before upload, frames are 512px JPEGs.

## Code conventions
- Server logic in `lib/*` services; routes stay thin (parse, call, return).
- Errors: throw `new AppError(code, userMessage)`. The message is shown to users, so write it as a clear sentence that says what to do.
- API errors are always `{ error: { code, message } }`. Client catches `ApiError` and calls `toast.error(e.message)`.
- Components are client components only when they need state or effects.
- Small files, named exports, no default exports except pages and layouts.
- No `any` except at the Groq and fal SDK boundaries.

## UX rules (non-negotiable)
- One primary action per screen, always in the same place (bottom of the Create panel, bottom right of campaign steps, sticky bottom bar on phones).
- Every button that spends credits is a `CostButton` showing "Label · N credits".
- Loading states show a skeleton at the final size plus elapsed time. No lone spinners.
- Every failure shows what happened and a fix ("Generation failed. Credits refunded." + "Try again").
- Every empty state has one clear button.
- Visible keyboard focus. Respect reduced motion. Works at 375px width.
- Match Higgsfield's look from screenshots, but use our own name and logo and never reuse its media.

## Copy rules
- **Never use em dashes** in UI copy, docs, comments or commit messages. Use a colon, comma, period or parentheses.
- Sentence case. Plain verbs. Buttons say exactly what happens.
- One word per action everywhere: "Approve" button → "Approved" toast.
- AI scores are called a "pre-review". Never claim they predict views.

## Definition of done (every task)
- Meets the "Done when" line in `docs/implementation.md` section 18
- `npm run build` passes with no type errors
- Works in mock mode, including the failure path
- Loading, empty and error states handled
- No console errors
- Committed with a clear message (e.g. `campaign: review board decisions and undo`)

## When stuck
- A fal or Groq schema mismatch: fix it in `config/models.ts` or `lib/ai/*`, nowhere else.
- A shared type seems wrong: stop and ask the lead instead of working around it.
- Something takes more than 30 minutes and is not P0: cut it, add a line to the README's "What I would build next".
