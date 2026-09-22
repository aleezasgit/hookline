import "server-only";
import { falProvider } from "./fal";
import { mockProvider } from "./mock";
import type { VideoProvider } from "./types";

export const engineMode = (): "fal" | "mock" =>
  process.env.ENGINE_MODE === "fal" ? "fal" : "mock";

export const getProvider = (name: "fal" | "mock"): VideoProvider =>
  name === "fal" ? falProvider : mockProvider;

// Uploads use fal storage whenever a key exists, even in mock mode. It spends no credits.
export const uploadProvider = (): VideoProvider =>
  process.env.FAL_KEY ? falProvider : mockProvider;
