import { config } from "dotenv";
config({ path: ".env.local" });
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fal } from "@fal-ai/client";
import { MODELS } from "../config/models";
import { PRESETS } from "../config/presets";
import { composeCreatePrompt } from "../lib/prompt";

fal.config({ credentials: process.env.FAL_KEY });
mkdirSync("public/previews", { recursive: true });

(async () => {
  const model = MODELS.pro;
  for (const p of PRESETS) {
    const path = `public/previews/${p.key}.mp4`;
    if (existsSync(path)) { console.log("skip", p.key); continue; }
    const prompt = composeCreatePrompt(p.key, p.placeholder, false);
    try {
      const res = await fal.subscribe(model.endpoints.t2v, {
        input: model.buildInput({ mode: "t2v", prompt, aspect: "9:16", duration: 5 }),
      });
      const url = model.parseOutput(res.data);
      if (!url) { console.log("no url", p.key); continue; }
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(path, buf);
      console.log("saved", path);
    } catch (e: any) {
      console.log("failed", p.key, e?.body ?? e?.message);
    }
  }
})();
