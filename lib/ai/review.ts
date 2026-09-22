import "server-only";
import { z } from "zod";
import { aiJson, fenceUserInput, USER_INPUT_WARNING } from "./client";
import { AI } from "@/config/ai";
import { RUBRIC } from "@/config/rubric";
import type { AiReview, Brief, Concept } from "@/lib/types";

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

const PLATFORM_LABEL: Record<Brief["platform"], string> = {
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
};

const RUBRIC_KEY: Record<string, string> = { hook: "hook", native: "native", onBrief: "on_brief", quality: "quality" };

function systemPrompt() {
  const lines = RUBRIC.map((r) => `- ${RUBRIC_KEY[r.key]}: ${r.label}. ${r.definition}`).join("\n");
  return `You are a strict content reviewer at a creator network. You pre-screen short AI-generated vertical videos before a human decides whether they get posted as organic content for a brand.
You receive 3 frames from one 5-second clip, in order: 0.5 seconds, the middle, the last frame. You also receive the brand brief and the hook the clip was meant to deliver.

Score each criterion from 1 to 5. Be critical. 5 is rare and means ready to post. 3 means usable with changes. 1 means unusable.
${lines}

For each criterion give one short reason, maximum 20 words, pointing at something visible in the frames.
suggested_fix: the single most valuable change to the video prompt, written as an instruction, maximum 25 words.
${USER_INPUT_WARNING}
Return only JSON in exactly this shape:
{"scores":{"hook":0,"native":0,"on_brief":0,"quality":0},"reasons":{"hook":"","native":"","on_brief":"","quality":""},"suggested_fix":""}`;
}

function userPrompt(brief: Brief, concept: Concept) {
  return `Brief: ${fenceUserInput(brief.productName)}, ${fenceUserInput(brief.productDescription)}. Audience: ${fenceUserInput(brief.audience)}. Goal: ${brief.goal}. Tone: ${brief.tone}. Platform: ${PLATFORM_LABEL[brief.platform]}.
Intended hook: "${fenceUserInput(concept.hookLine)}"
What the clip was meant to show: ${fenceUserInput(concept.visualPrompt)}
The 3 frames follow in order.`;
}

export async function reviewClip(args: {
  frames: string[]; brief: Brief; concept: Concept; workspaceId: string;
}): Promise<AiReview> {
  const out = await aiJson(ReviewOut, {
    system: systemPrompt(),
    user: userPrompt(args.brief, args.concept),
    images: args.frames,
    temperature: AI.temperature.review,
    maxTokens: AI.maxTokensByCall.review,
    model: AI.visionModel,
    reasoningEffort: AI.visionReasoningEffort,
    workspaceId: args.workspaceId,
    kind: "review",
  });
  const scores = {
    hook: Math.round(out.scores.hook),
    native: Math.round(out.scores.native),
    onBrief: Math.round(out.scores.on_brief),
    quality: Math.round(out.scores.quality),
  };
  const overall = Math.round(((scores.hook + scores.native + scores.onBrief + scores.quality) / 4) * 10) / 10;
  const verdict = overall >= 4 ? "strong" : overall >= 3 ? "okay" : "weak";
  return {
    scores,
    reasons: {
      hook: out.reasons.hook,
      native: out.reasons.native,
      onBrief: out.reasons.on_brief,
      quality: out.reasons.quality,
    },
    overall,
    verdict,
    suggestedFix: out.suggested_fix,
  };
}
