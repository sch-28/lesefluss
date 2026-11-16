import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(["../../**/*.tsx", "!../../**/__tests__/**"], {
	query: "?raw",
	import: "default",
	eager: true,
});

describe("menu triggers", () => {
	it("use the MoreHorizontal kebab, never MoreVertical", () => {
		const offenders = Object.entries(sources)
			.filter(([, src]) => /\bMoreVertical\b/.test(src))
			.map(([path]) => path);
		expect(offenders).toEqual([]);
	});
});
