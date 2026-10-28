import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/**
 * Reader render cost, a baseline production build against the current one
 * (TASK-205.6 AC8). Not part of the e2e suite:
 *   scripts/perf-baseline.sh          # builds .perf/baseline-dist
 *   pnpm build                        # the candidate, dist/
 *   pnpm e2e:perf                     # both served by vite preview, alternated
 *   node e2e/perf/compare.mjs         # medians side by side
 * PERF_BASELINE_DIST overrides the baseline's dist.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));
const BASELINE_DIST = process.env.PERF_BASELINE_DIST ?? path.resolve(HERE, ".perf/baseline-dist");
const CANDIDATE_DIST = path.resolve(HERE, "dist");

// A WEB_BUILD dist lives under /app/ and would 404 at the preview's root.
for (const dist of [BASELINE_DIST, CANDIDATE_DIST]) {
	const html = readFileSync(path.join(dist, "index.html"), "utf8");
	if (html.includes('src="/app/'))
		throw new Error(`${dist} is a WEB_BUILD (/app/) build; rebuild without WEB_BUILD`);
}

export const PERF_PORTS = { baseline: 3511, candidate: 3512 } as const;

const preview = (dist: string, port: number) => ({
	command: `pnpm exec vite preview --outDir ${dist} --port ${port} --strictPort`,
	port,
	timeout: 60_000,
	reuseExistingServer: false,
});

export default defineConfig({
	testDir: "./e2e/perf",
	testMatch: /\.perf\.ts$/,
	timeout: 60 * 60_000,
	workers: 1,
	reporter: "list",
	webServer: [
		preview(BASELINE_DIST, PERF_PORTS.baseline),
		preview(CANDIDATE_DIST, PERF_PORTS.candidate),
	],
});
