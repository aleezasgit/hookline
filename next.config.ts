import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md is this project's own curated instructions file; don't let
  // Next.js append its generated agent-rules block to it.
  agentRules: false,
};

export default nextConfig;
