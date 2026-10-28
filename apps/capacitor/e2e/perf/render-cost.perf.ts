import { writeFileSync } from "node:fs";
import { type Browser, type CDPSession, type Page, test } from "@playwright/test";
import { PERF_PORTS } from "../../playwright.perf.config";
import { bigBookFixture } from "../helpers/big-book";
import { openBookFromLibrary, seedFixture } from "../helpers/seed";
import { reader } from "../page-objects/reader";

/**
 * Reader render cost on a long book at 4x CPU throttle, baseline against
 * candidate: opening the book until its text is revealed, then reading on (a
 * scroll fling, or 20 page turns), in scroll and page mode. The two builds run
 * in alternating order after one discarded warm-up each, so drift (thermal,
 * caches) does not favour either. Production builds only, so every wait reads
 * the DOM.
 */

const RUNS = Number(process.env.PERF_RUNS ?? 7);
const CPU_THROTTLE = 4;
const PARAGRAPHS = Number(process.env.PERF_PARAGRAPHS ?? 2000);
const VIEWPORT = { width: 412, height: 915 };

type Build = keyof typeof PERF_PORTS;
type Sample = Record<string, number>;

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
	const { metrics } = await cdp.send("Performance.getMetrics");
	return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

const cost = (before: Record<string, number>, after: Record<string, number>, phase: string) => ({
	[`${phase}.scriptMs`]: (after.ScriptDuration - before.ScriptDuration) * 1000,
	[`${phase}.layoutMs`]: (after.LayoutDuration - before.LayoutDuration) * 1000,
	[`${phase}.taskMs`]: (after.TaskDuration - before.TaskDuration) * 1000,
});

/** Text revealed, not just mounted: both views fade in from opacity 0 once placed. */
async function waitRevealed(page: Page, mode: "scroll" | "page") {
	const selector = mode === "scroll" ? ".reader-scroll-content" : ".page-view";
	await page.waitForFunction(
		(sel) => {
			const el = document.querySelector(sel);
			return !!el && getComputedStyle(el).opacity === "1";
		},
		selector,
		{ timeout: 120_000 },
	);
}

async function openBuild(browser: Browser, build: Build, mode: "scroll" | "page") {
	const context = await browser.newContext({
		baseURL: `http://localhost:${PERF_PORTS[build]}`,
		viewport: VIEWPORT,
	});
	const page = await context.newPage();
	console.log(`${build}: seeding ${PARAGRAPHS} paragraphs`);
	const title = await seedFixture(page, bigBookFixture({ paragraphCount: PARAGRAPHS }), "big.epub");
	if (mode === "page") {
		// Stored in the settings, so every later open is in page mode.
		await openBookFromLibrary(page, title);
		await reader.expectLoaded(page);
		await reader.setPaginationStyle(page, "page");
	}
	return { context, page, title };
}

async function measure(page: Page, title: string, mode: "scroll" | "page"): Promise<Sample> {
	console.log(`  measuring ${page.url()}`);
	await page.goto("/tabs/library");
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

	const beforeOpen = await metrics(cdp);
	const started = performance.now();
	await openBookFromLibrary(page, title);
	await waitRevealed(page, mode);
	const sample: Sample = { "open.wallMs": performance.now() - started };
	await page.waitForTimeout(1500);
	Object.assign(sample, cost(beforeOpen, await metrics(cdp), "open"));
	const dom = await cdp.send("Memory.getDOMCounters");
	sample["dom.nodes"] = dom.nodes;
	sample["dom.jsEventListeners"] = dom.jsEventListeners;

	await reader.blurFocusedControl(page);
	const beforeRead = await metrics(cdp);
	for (let i = 0; i < 20; i++) {
		if (mode === "scroll") {
			await reader.wheel(page, 800);
			await page.waitForTimeout(50);
		} else {
			await page.keyboard.press("ArrowRight");
			await page.waitForTimeout(300);
		}
	}
	await page.waitForTimeout(1500);
	Object.assign(sample, cost(beforeRead, await metrics(cdp), "read"));
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	await cdp.detach();
	return sample;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function summarize(samples: Sample[]) {
	return Object.fromEntries(
		Object.keys(samples[0]).map((k) => {
			const xs = samples.map((s) => s[k]);
			return [k, { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) }];
		}),
	);
}

for (const mode of ["scroll", "page"] as const) {
	test(`render cost, ${mode} mode`, async ({ browser }) => {
		const builds = {
			baseline: await openBuild(browser, "baseline", mode),
			candidate: await openBuild(browser, "candidate", mode),
		};
		const samples: Record<Build, Sample[]> = { baseline: [], candidate: [] };
		// Run -1 is the warm-up, discarded; then the order alternates every run.
		for (let run = -1; run < RUNS; run++) {
			const order: Build[] = run % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
			for (const build of order) {
				const { page, title } = builds[build];
				const sample = await measure(page, title, mode);
				if (run >= 0) samples[build].push(sample);
			}
		}
		for (const build of ["baseline", "candidate"] as const) {
			const summary = summarize(samples[build]);
			writeFileSync(
				`test-results/perf-${build}-${mode}.json`,
				JSON.stringify({ build, mode, summary, samples: samples[build] }, null, 1),
			);
			console.log(build, mode, JSON.stringify(summary));
			await builds[build].context.close();
		}
	});
}
