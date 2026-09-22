import "server-only";
import { z } from "zod";
import { aiJson, fenceUserInput, USER_INPUT_WARNING } from "./client";
import { AI } from "@/config/ai";
import type { Brief } from "@/lib/types";

const Out = z.object({ visual_prompt: z.string().min(20).max(800) });

function systemPrompt() {
  return `You rewrite prompts for an AI video model that makes ONE continuous 5-second vertical shot.
Apply the feedback to the original prompt. If a human note is given, it takes priority over the reviewer suggestion.
Keep what already works. Rules: the product is visible in the first second, one continuous shot, no on-screen text, no logos, no scene cuts, no dialogue. 40 to 90 words.
${USER_INPUT_WARNING}
Return only JSON: {"visual_prompt":"..."}`;
}

function userPrompt(a: { original: string; humanNote?: string | null; aiFix?: string | null; brief: Brief }) {
  const fix = a.aiFix?.trim();
  const note = a.humanNote?.trim();
  const lines = [
    `Product: ${fenceUserInput(a.brief.productName)}, ${fenceUserInput(a.brief.productDescription)}`,
    `Original prompt: ${fenceUserInput(a.original)}`,
  ];
  if (note) lines.push(`Human note: ${fenceUserInput(note)}`);
  if (fix) lines.push(`Reviewer suggestion: ${fenceUserInput(fix)}`);
  if (!note && !fix) lines.push("Reviewer suggestion: Make the hook stronger in the first second.");
  return lines.join("\n");
}

export async function rewritePrompt(a: {
  original: string; humanNote?: string | null; aiFix?: string | null; brief: Brief; workspaceId: string;
}): Promise<string> {
  const out = await aiJson(Out, {
    system: systemPrompt(),
    user: userPrompt(a),
    temperature: AI.temperature.rewrite,
    maxTokens: AI.maxTokensByCall.rewrite,
    model: AI.textModel,
    reasoningEffort: AI.textReasoningEffort,
    workspaceId: a.workspaceId,
    kind: "rewrite",
  });
  return out.visual_prompt;
}
