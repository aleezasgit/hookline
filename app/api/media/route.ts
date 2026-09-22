import { LIMITS } from "@/config/limits";

export const runtime = "nodejs";

export const GET = async (req: Request) => {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try { target = new URL(raw); } catch { return new Response("Bad url", { status: 400 }); }
  const ok = target.protocol === "https:" &&
    LIMITS.mediaHostSuffixes.some((s) => target.hostname === s || target.hostname.endsWith("." + s));
  if (!ok) return new Response("Host not allowed", { status: 400 });
  const upstream = await fetch(target);
  if (!upstream.ok || !upstream.body) return new Response("Upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      "cache-control": "public, max-age=3600",
    },
  });
};
