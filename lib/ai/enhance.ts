import "server-only";
import { z } from "zod";
import { aiJson, fenceUserInput, USER_INPUT_WARNING } from "./client";
import { AI } from "@/config/ai";
import { getPreset } from "@/config/presets";

const Out = z.object({ prompt: z.string().min(3).max(500) });

const SYSTEM = `You improve prompts for an AI video model that makes one short continuous shot.
Keep the user's idea and subject. Add concrete detail about the subject, action, setting, lighting and mood.
Do not describe camera movement; the chosen preset controls the camera. Maximum 60 words.
${USER_INPUT_WARNING}
Return only JSON: {"prompt":"..."}`;

export async function enhancePrompt(a: { prompt: string; presetKey: string | null; workspaceId: string }): Promise<string> {
  const preset = getPreset(a.presetKey);
  const presetLine = preset ? `${preset.name}, ${preset.description}` : "none";
  const out = await aiJson(Out, {
    system: SYSTEM,
    user: `Preset: ${presetLine}\nPrompt: ${fenceUserInput(a.prompt)}`,
    temperature: AI.temperature.enhance,
    maxTokens: AI.maxTokensByCall.enhance,
    model: AI.textModel,
    reasoningEffort: AI.textReasoningEffort,
    workspaceId: a.workspaceId,
    kind: "enhance",
  });
  return out.prompt;
}
