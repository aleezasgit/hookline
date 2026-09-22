// H9: AI quality check. Groq only, never touches fal, never spends credits.
// Run: npx tsx --tsconfig scripts/tsconfig.eval.json scripts/ai-eval.ts
//
// Part A calls generateConcepts for 5 varied briefs and checks structural
// quality (distinct hook types, valid preset keys, hook line and caption
// length limits). Part B calls reviewClip once against a matched product
// clip and once against a mismatched one, and checks the matched clip scores
// higher on "on brief". Needs the dev server running on localhost:3002 (for
// the two local preview clips reviewClip's frames come from) and a real
// Postgres reachable at DATABASE_URL (only to satisfy ai_usage's workspace
// foreign key, nothing is charged or persisted beyond that one row).
import { config } from "dotenv";
config({ path: ".env.local" });

// The app modules below are loaded with a dynamic import inside main(), not a
// static one: ES modules resolve and execute all static imports (in
// dependency order) before a file's own top-level code runs, which would run
// lib/ai/client.ts's `new Groq(...)` before the config() call above ever
// fires and GROQ_API_KEY is set. Dynamic import() is a plain runtime
// expression evaluated in place, so it waits until main() actually calls it.
import { randomUUID } from "node:crypto";
import { HOOK_KEYS } from "@/config/hooks";
import { PRESET_KEYS } from "@/config/presets";
import type { Brief, Concept } from "@/lib/types";
import type { chromium as ChromiumType } from "@playwright/test";
import type { db as DbType, workspaces as WorkspacesType } from "@/lib/db";
import type { generateConcepts as GenerateConceptsType } from "@/lib/ai/concepts";
import type { reviewClip as ReviewClipType } from "@/lib/ai/review";

let chromium: typeof ChromiumType;
let db: typeof DbType;
let workspaces: typeof WorkspacesType;
let generateConcepts: typeof GenerateConceptsType;
let reviewClip: typeof ReviewClipType;

const DEV_SERVER = "http://localhost:3002";
const PAUSE_MS = 4000; // spread calls out, well under the 10/min per-workspace limit

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const BRIEFS: { label: string; brief: Brief }[] = [
  {
    label: "app",
    brief: {
      productName: "Habitly",
      productDescription: "A habit tracker app with streaks and a friend leaderboard",
      productImageUrl: null,
      audience: "College students and young professionals building routines",
      goal: "installs",
      platform: "tiktok",
      tone: "relatable",
      conceptCount: 4,
    },
  },
  {
    label: "skincare",
    brief: {
      productName: "Glowdrop",
      productDescription: "A vitamin C serum for brightening dull skin, in a small amber dropper bottle",
      productImageUrl: null,
      audience: "Women 18-30 into skincare routines",
      goal: "sales",
      platform: "reels",
      tone: "aspirational",
      conceptCount: 4,
    },
  },
  {
    label: "snack",
    brief: {
      productName: "Cravo",
      productDescription: "A spicy mango dried-fruit snack in a resealable pouch",
      productImageUrl: null,
      audience: "Gen Z snackers who share food finds",
      goal: "awareness",
      platform: "tiktok",
      tone: "funny",
      conceptCount: 3,
    },
  },
  {
    label: "fitness gear",
    brief: {
      productName: "Coilband",
      productDescription: "A resistance band set with color-coded tension levels for home workouts",
      productImageUrl: null,
      audience: "People starting home workouts without a gym",
      goal: "sales",
      platform: "shorts",
      tone: "educational",
      conceptCount: 4,
    },
  },
  {
    label: "local service",
    brief: {
      productName: "Northside Mobile Detailing",
      productDescription: "A mobile car detailing service that comes to your driveway",
      productImageUrl: null,
      audience: "Car owners in the local area who hate going to a shop",
      goal: "awareness",
      platform: "reels",
      tone: "chaotic",
      conceptCount: 3,
    },
  },
];

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

async function runConceptChecks(workspaceId: string) {
  console.log("\n=== Part A: concept generation, 5 briefs ===\n");
  let failures = 0;

  for (const { label, brief } of BRIEFS) {
    console.log(`--- ${label} (${brief.conceptCount} concepts) ---`);
    let concepts;
    try {
      concepts = await generateConcepts({ brief, count: brief.conceptCount, avoid: [], workspaceId });
    } catch (e) {
      failures++;
      console.log(`  FAIL: generateConcepts threw: ${e instanceof Error ? e.message : e}`);
      await sleep(PAUSE_MS);
      continue;
    }

    const hookTypes = concepts.map((c) => c.hookType);
    const distinctHooks = new Set(hookTypes).size === hookTypes.length;
    if (!distinctHooks) {
      failures++;
      console.log(`  FAIL: repeated hook types (${hookTypes.join(", ")})`);
    }

    for (const c of concepts) {
      const notes: string[] = [];
      if (!HOOK_KEYS.includes(c.hookType as never)) notes.push(`unknown hook_type "${c.hookType}"`);
      if (!PRESET_KEYS.includes(c.presetKey)) notes.push(`unknown preset_key "${c.presetKey}"`);
      const words = wordCount(c.hookLine);
      if (words > 12) notes.push(`hook_line is ${words} words (max 12)`);
      if (c.caption.length > 150) notes.push(`caption is ${c.caption.length} chars (max 150)`);
      if (notes.length) {
        failures++;
        console.log(`  FAIL [${c.hookType}]: ${notes.join("; ")}`);
      } else {
        console.log(`  ok   [${c.hookType}/${c.presetKey}] "${c.hookLine}" (${words}w, caption ${c.caption.length}c)`);
      }
    }
    await sleep(PAUSE_MS);
  }

  return failures;
}

// Mirrors lib/media/frames.ts exactly (0.5s, middle, last frame at 512px
// wide), run inside a real browser via Playwright since Node has no canvas or
// video decoder of its own and this script must not touch fal or ffmpeg.
//
// Built and passed as a raw source string, not a TS closure: tsx/esbuild's
// CJS transpile of this file injects a `__name` helper call around any named
// const-arrow function (like a `once` helper would be), and Playwright's
// page.evaluate only ships the function's own source to the browser, not that
// helper, which throws "__name is not defined" at evaluate time. A plain
// string is sent to the browser untouched by esbuild.
function frameExtractorSource(url: string) {
  return `(async () => {
    const src = ${JSON.stringify(url)};
    const wait = (el, ev) => new Promise((r) => el.addEventListener(ev, () => r(), { once: true }));
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = src;
    document.body.appendChild(video);
    await wait(video, "loadeddata");
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    const times = [0.5, d / 2, d - 0.1].map((t) => Math.max(0, Math.min(t, d - 0.05)));
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = Math.round(512 * (video.videoHeight / video.videoWidth || 16 / 9));
    const ctx = canvas.getContext("2d");
    const frames = [];
    for (const t of times) {
      video.currentTime = t;
      await wait(video, "seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return frames;
  })()`;
}

async function extractFrames(page: import("@playwright/test").Page, url: string): Promise<string[]> {
  // Navigates to the dev server itself, not "about:blank": a null-origin page
  // fetching a loopback URL trips Chromium's Private Network Access block
  // ("insecure context ... more-private address space `loopback`"), which
  // fails the video element's load silently rather than throwing.
  await page.goto(DEV_SERVER);
  return page.evaluate(frameExtractorSource(url));
}

function fakeConcept(over: Partial<Concept>): Concept {
  return {
    id: randomUUID(), campaignId: randomUUID(), position: 0,
    hookType: "unboxing", hookLine: "", visualPrompt: "", presetKey: "ugc-unboxing",
    caption: "", selected: true, createdAt: new Date().toISOString(),
    ...over,
  };
}

async function runReviewCheck(workspaceId: string) {
  console.log("\n=== Part B: review, matched clip vs mismatched clip ===\n");

  const earbudsBrief: Brief = {
    productName: "Puloop", productDescription: "Wireless earbuds in a small charging case",
    productImageUrl: null, audience: "Commuters who want a clean daily-carry gadget",
    goal: "sales", platform: "tiktok", tone: "relatable", conceptCount: 3,
  };
  const earbudsConcept = fakeConcept({
    hookType: "unboxing",
    hookLine: "Finally, earbuds that fit my ears",
    visualPrompt: "First-person POV of hands opening a small box and lifting out wireless earbuds in their charging case",
    presetKey: "ugc-unboxing",
    caption: "the earbuds I actually keep in my bag #tech #dailycarry",
  });

  // public/previews/ugc-unboxing.mp4: an actual UGC-style unboxing clip
  // (fal-generated earlier for Explore), matches the brief and concept above.
  // public/previews/disintegrate.mp4: a studio product-effects clip of an
  // unrelated subject breaking into particles, matches neither the product
  // nor the UGC style. Both already exist in the repo (H9 spends nothing new).
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    console.log("extracting frames from ugc-unboxing.mp4 (matched) and disintegrate.mp4 (mismatched)...");
    const goodFrames = await extractFrames(page, `${DEV_SERVER}/previews/ugc-unboxing.mp4`);
    const badFrames = await extractFrames(page, `${DEV_SERVER}/previews/disintegrate.mp4`);

    const good = await reviewClip({ frames: goodFrames, brief: earbudsBrief, concept: earbudsConcept, workspaceId });
    await sleep(PAUSE_MS);
    const bad = await reviewClip({ frames: badFrames, brief: earbudsBrief, concept: earbudsConcept, workspaceId });

    console.log(`  matched clip:     onBrief=${good.scores.onBrief} overall=${good.overall} (${good.verdict})`);
    console.log(`    reason: ${good.reasons.onBrief}`);
    console.log(`  mismatched clip:  onBrief=${bad.scores.onBrief} overall=${bad.overall} (${bad.verdict})`);
    console.log(`    reason: ${bad.reasons.onBrief}`);

    if (good.scores.onBrief > bad.scores.onBrief) {
      console.log("  ok   matched clip scored higher on on-brief");
      return 0;
    }
    console.log("  FAIL matched clip did not score higher on on-brief than the mismatched clip");
    return 1;
  } finally {
    await browser.close();
  }
}

async function main() {
  ({ chromium } = await import("@playwright/test"));
  ({ db, workspaces } = await import("@/lib/db"));
  ({ generateConcepts } = await import("@/lib/ai/concepts"));
  ({ reviewClip } = await import("@/lib/ai/review"));

  const [ws] = await db.insert(workspaces).values({ id: randomUUID(), credits: 0 }).returning();
  console.log(`eval workspace: ${ws.id}`);

  let failures = 0;
  failures += await runConceptChecks(ws.id);
  failures += await runReviewCheck(ws.id);

  console.log(`\n=== Summary: ${failures === 0 ? "all checks passed" : `${failures} check(s) failed`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ai-eval crashed:", e);
  process.exit(1);
});
