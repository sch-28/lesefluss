import { defineConfig } from "vitest/config";
import baseConfig from "./vite.config";

/**
 * Live tests hit real upstream providers (AO3, ScribbleHub, …) to catch
 * site re-skins that fixture-based unit tests can't see. Run manually before
 * each release — NEVER in CI:
 *
 *   pnpm test:live
 *
 * Tests live alongside their unit counterparts as `*.live.test.ts`. The
 * default vitest config excludes that pattern; this config opts in.
 *
 * Per-provider rate limits still apply (5s for AO3), so the suite is slower
 * than the unit suite but still bounded — keep live tests minimal: one
 * smoke per provider, asserting the contract loosely (≥1 chapter parsed,
 * non-empty content extracted, etc.).
 */
export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		include: ["src/**/*.live.test.ts"],
		exclude: ["**/node_modules/**"],
		// Use Node's native fetch (uncorked, no SOP, reliable) instead of happy-dom's
		// — happy-dom's fetch hangs on Cloudflare-fronted endpoints. DOMParser is
		// polyfilled in setup-live.ts so adapter code is unchanged between runs.
		environment: "node",
		setupFiles: ["src/test/setup-live.ts"],
		// Each test's wall-clock = sum of upstream latencies + per-provider throttle
		// gates (5s for AO3, ≥2s for others) for every fetchHtml call. The AO3
		// smoke makes 5 calls (search, metadata, list, first chapter, last
		// chapter) = 20s of pure throttle + Cloudflare-fronted page loads,
		// which can stretch under challenge issuance. 120s is generous but
		// still flags genuine hangs.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
