import "server-only";
import { fal } from "@fal-ai/client";
import { getModel } from "@/config/models";
import type { VideoProvider } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

export const falProvider: VideoProvider = {
  name: "fal",

  async submit({ modelKey, prompt, imageUrl, aspect, duration }) {
    const model = getModel(modelKey);
    const mode = imageUrl ? "i2v" : "t2v";
    const endpoint = model.endpoints[mode];
    const input = model.buildInput({ mode, prompt, imageUrl, aspect, duration });
    const { request_id } = await fal.queue.submit(endpoint, { input });
    return { endpoint, requestId: request_id };
  },

  async status({ endpoint, requestId, modelKey }) {
    const s = await fal.queue.status(endpoint, { requestId, logs: false });
    if (s.status === "IN_QUEUE") return { state: "queued" };
    if (s.status === "IN_PROGRESS") return { state: "running" };
    // COMPLETED: success or failure is only known from the result call
    try {
      const { data } = await fal.queue.result(endpoint, { requestId });
      const url = getModel(modelKey).parseOutput(data);
      return url ? { state: "done", outputUrl: url } : { state: "failed", error: "The model returned no video." };
    } catch (e: any) {
      return { state: "failed", error: shortError(e) };
    }
  },

  async upload(file) {
    return fal.storage.upload(file);
  },
};

function shortError(e: any) {
  const msg = e?.body?.detail?.[0]?.msg ?? e?.body?.detail ?? e?.message ?? "Generation failed.";
  const text = String(typeof msg === "string" ? msg : JSON.stringify(msg));
  // H5: the safety checker's rejection reads as an ordinary provider error unless
  // mapped to something a user would actually understand. GenerationCard appends
  // "Credits refunded." itself, so this stays that phrase-free like every other
  // message returned here.
  if (/safety|nsfw|content polic|flagged|moderat/i.test(text))
    return "This request was blocked by the content filter.";
  return text.slice(0, 200);
}
