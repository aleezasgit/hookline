// H8: "server-only" isn't a real installed package; Next's bundler resolves the
// bare specifier specially depending on build target. vitest has no such
// resolution, so vitest.config.ts aliases "server-only" to this no-op instead.
export {};
