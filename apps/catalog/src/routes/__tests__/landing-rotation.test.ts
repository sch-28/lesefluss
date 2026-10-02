import { beforeAll, describe, expect, it, vi } from "vitest";

let genresForDay: typeof import("../landing.js").genresForDay;
let GENRES: typeof import("../../lib/genres.js").GENRES;

beforeAll(async () => {
	vi.stubEnv("DATABASE_URL", process.env.DATABASE_URL ?? "postgres://unused@localhost/unused");
	({ genresForDay } = await import("../landing.js"));
	({ GENRES } = await import("../../lib/genres.js"));
});

describe("genresForDay", () => {
	it("picks three distinct genres and moves on the next day", () => {
		const today = genresForDay(20_000).map((g) => g.id);
		expect(new Set(today).size).toBe(3);
		expect(genresForDay(20_001).map((g) => g.id)).not.toEqual(today);
	});

	it("cycles through every genre", () => {
		const seen = new Set<string>();
		for (let day = 0; day < GENRES.length; day++) for (const g of genresForDay(day)) seen.add(g.id);
		expect(seen.size).toBe(GENRES.length);
	});
});
