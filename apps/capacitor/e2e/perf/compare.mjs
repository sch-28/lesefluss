// Prints baseline vs candidate medians (with each side's min..max) from the
// render-cost runs in test-results/. Usage: node e2e/perf/compare.mjs
import { readFileSync } from "node:fs";

for (const mode of ["scroll", "page"]) {
	const read = (project) =>
		JSON.parse(readFileSync(`test-results/perf-${project}-${mode}.json`, "utf8")).summary;
	const base = read("baseline");
	const cand = read("candidate");
	console.log(`\n${mode} mode (median, min..max)`);
	for (const key of Object.keys(base)) {
		const b = base[key];
		const c = cand[key];
		const delta = ((c.median - b.median) / b.median) * 100;
		const fmt = (s) => `${s.median.toFixed(0)} (${s.min.toFixed(0)}..${s.max.toFixed(0)})`;
		console.log(
			`${key.padEnd(22)} ${fmt(b).padEnd(22)} ${fmt(c).padEnd(22)} ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
		);
	}
}
