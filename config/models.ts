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
      resolution,                  // verified against the real API in scripts/fal-smoke.ts
      duration: String(duration),
      aspect_ratio: aspect,
      generate_audio: false,       // audio must stay off
      // H5: confirmed on the model's API tab (enable_safety_checker, boolean,
      // default true), set explicitly rather than relying on the default. Not yet
      // exercised against a real call, per the "stay in mock mode until H11" rule;
      // verify it's accepted during H11's real-mode pass.
      enable_safety_checker: true,
    };
    return mode === "i2v" ? { ...base, image_url: imageUrl } : base;
  };
}

const parseSeedance = (data: any): string | null => data?.video?.url ?? null; // verified against the real API

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
