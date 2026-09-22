import type { Aspect, ModelKey } from "@/lib/types";

export interface SubmitInput {
  generationId: string;
  modelKey: ModelKey;
  prompt: string;        // composed prompt
  imageUrl?: string | null;
  aspect: Aspect;
  duration: number;
}

export interface StatusInput {
  generationId: string;
  endpoint: string;
  requestId: string;
  modelKey: ModelKey;
  prompt: string;
  createdAt: Date;
}

export type ProviderState =
  | { state: "queued" }
  | { state: "running" }
  | { state: "done"; outputUrl: string }
  | { state: "failed"; error: string };

export interface VideoProvider {
  name: "fal" | "mock";
  submit(input: SubmitInput): Promise<{ endpoint: string; requestId: string }>;
  status(input: StatusInput): Promise<ProviderState>;
  upload(file: File): Promise<string>;
}
