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
