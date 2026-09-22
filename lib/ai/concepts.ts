import "server-only";
import { z } from "zod";
import { aiJson, fenceUserInput, USER_INPUT_WARNING } from "./client";
import { AI } from "@/config/ai";
import { HOOK_TYPES, HOOK_KEYS } from "@/config/hooks";
import { PRESETS, PRESET_KEYS, DEFAULT_CAMPAIGN_PRESET } from "@/config/presets";
import type { Brief } from "@/lib/types";

const ConceptOut = z.object({
  hook_type: z.enum(HOOK_KEYS),
  hook_line: z.string().min(3).max(120),
  visual_prompt: z.string().min(20).max(800),
  preset_key: z.string(),
  caption: z.string().min(1).max(300),
});
const Out = z.object({ concepts: z.array(ConceptOut).min(1) });

const PLATFORM_LABEL: Record<Brief["platform"], string> = {
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
};

function systemPrompt() {
  const hookList = Object.entries(HOOK_TYPES)
    .map(([key, h]) => `  - ${key}: ${h.description}`)
    .join("\n");
  const presetList = PRESETS
    .map((p) => `  - ${p.key}: ${p.name}, ${p.description}`)
    .join("\n");
  return `You are a short-form video strategist at a creator network that makes organic TikTok, Instagram Reels and YouTube Shorts content for consumer brands.
Organic content must feel native, like a real person posted it from their own account. It must not look like an ad.

Each concept you write becomes ONE 5-second vertical AI-generated video clip.

Rules for every concept:
- hook_type: one of these keys:
${hookList}
- hook_line: the line a creator would say or show on screen in the first 2 seconds. Maximum 12 words. Conversational and specific. No hashtags, no emojis.
- visual_prompt: a prompt for an AI video model describing ONE continuous 5-second shot. Include subject, action, setting, camera angle and lighting. The product must be visible in the first second. No on-screen text, no logos, no split screens, no scene cuts, no dialogue. 40 to 90 words.
- preset_key: one of these keys:
${presetList}
  Pick the best fit. Prefer ugc presets for relatable, funny and educational tones.
- caption: the post caption. Maximum 150 characters including 2 or 3 relevant hashtags.

Make the concepts clearly different from each other: different hook types, settings, emotions and presets.
${USER_INPUT_WARNING}
Return only JSON in exactly this shape:
{"concepts":[{"hook_type":"...","hook_line":"...","visual_prompt":"...","preset_key":"...","caption":"..."}]}`;
}

function userPrompt(brief: Brief, count: number, avoid: string[]) {
  const lines = [
    "Brand brief",
    `Product: ${fenceUserInput(brief.productName)}`,
    `What it is: ${fenceUserInput(brief.productDescription)}`,
    `Audience: ${fenceUserInput(brief.audience)}`,
    `Goal: ${brief.goal}`,
    `Platform: ${PLATFORM_LABEL[brief.platform]}`,
    `Tone: ${brief.tone}`,
  ];
  if (brief.productImageUrl)
    lines.push("The attached image is the product photo. Every video will START FROM THIS PHOTO, so describe motion and camera action that can plausibly begin from it.");
  if (avoid.length)
    lines.push(`Do not repeat or closely imitate these existing hooks: ${fenceUserInput(avoid.join(" | "))}`);
  lines.push(`Write ${count} concepts.`);
  return lines.join("\n");
}

export async function generateConcepts(args: { brief: Brief; count: number; avoid: string[]; workspaceId: string }) {
  const images = args.brief.productImageUrl && !args.brief.productImageUrl.startsWith("data:")
    ? [args.brief.productImageUrl]
    : undefined;
  // NOTE (H4): gpt-oss-120b is text-only (confirmed: it rejects image_url content
  // outright), but concepts generation needs vision when the brief has a product
  // photo, to describe motion that can plausibly start from it. Falls back to the
  // vision model only for that case; every photo-less brief (the common case)
  // still moves to gpt-oss-120b, which is most of what spreads the rate limit.
  const out = await aiJson(Out, {
    system: systemPrompt(),
    user: userPrompt(args.brief, args.count, args.avoid),
    images,
    temperature: AI.temperature.concepts,
    maxTokens: AI.maxTokensByCall.concepts,
    model: images ? AI.visionModel : AI.textModel,
    reasoningEffort: images ? AI.visionReasoningEffort : AI.textReasoningEffort,
    workspaceId: args.workspaceId,
    kind: "concepts",
  });
  return out.concepts.slice(0, args.count).map((c) => ({
    hookType: c.hook_type,
    hookLine: c.hook_line,
    visualPrompt: c.visual_prompt,
    presetKey: PRESET_KEYS.includes(c.preset_key) ? c.preset_key : DEFAULT_CAMPAIGN_PRESET,
    caption: c.caption,
  }));
}
