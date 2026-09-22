import { config } from "dotenv";
config({ path: ".env.local" });
import { fal } from "@fal-ai/client";
import { MODELS } from "../config/models";

fal.config({ credentials: process.env.FAL_KEY });

// A public product-style photo. Replace with any direct image URL if this one fails.
const IMAGE = process.argv[2] ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/640px-PNG_transparency_demonstration_1.png";

async function run(label: string, modelKey: "fast" | "pro", mode: "t2v" | "i2v") {
  const model = MODELS[modelKey];
  const input = model.buildInput({
    mode,
    prompt: "A sneaker on a wet street at night, slow dolly in, cinematic lighting",
    imageUrl: mode === "i2v" ? IMAGE : null,
    aspect: "9:16",
    duration: 5,
  });
  console.log(`\n=== ${label} ===\nendpoint: ${model.endpoints[mode]}\ninput:`, input);
  const t0 = Date.now();
  try {
    const res = await fal.subscribe(model.endpoints[mode], { input, logs: false });
    const url = model.parseOutput(res.data);
    console.log(`ok in ${Math.round((Date.now() - t0) / 1000)}s`);
    console.log("parsed url:", url);
    if (!url) console.log("raw output (fix parseOutput):", JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.log("FAILED:", JSON.stringify(e?.body ?? e?.message, null, 2));
  }
}

(async () => {
  await run("Fast text-to-video", "fast", "t2v");
  await run("Fast image-to-video", "fast", "i2v");
  await run("Pro image-to-video", "pro", "i2v");
})();
