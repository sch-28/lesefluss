import { describe, expect, it } from "vitest";
import { lostReadingDays } from "../session-delete-impact";

const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const row = (id: string, startedAt: number, durationMs = 60_000) => ({ id, startedAt, durationMs });

describe("lostReadingDays", () => {
	it("names a day whose only session is deleted", () => {
		const all = [row("a", at(3)), row("b", at(4))];
		expect(lostReadingDays(new Set(["a"]), all)).toEqual(["2026-11-03"]);
	});

	it("keeps a day another session still reads on", () => {
		const all = [row("a", at(3, 9)), row("b", at(3, 18))];
		expect(lostReadingDays(new Set(["a"]), all)).toEqual([]);
	});

	it("loses the day when every session on it goes", () => {
		const all = [row("a", at(3, 9)), row("b", at(3, 18)), row("c", at(5))];
		expect(lostReadingDays(new Set(["a", "b"]), all)).toEqual(["2026-11-03"]);
	});

	it("counts a late-night session for the evening before, as the streak does", () => {
		const all = [row("late", at(4, 2)), row("eve", at(3, 20))];
		expect(lostReadingDays(new Set(["late"]), all)).toEqual(["2026-11-04"]);
	});

	it("ignores a zero-length session, which never counted", () => {
		const all = [row("empty", at(3), 0)];
		expect(lostReadingDays(new Set(["empty"]), all)).toEqual([]);
	});

	it("is empty when nothing listed exists", () => {
		expect(lostReadingDays(new Set(["gone"]), [row("a", at(3))])).toEqual([]);
	});
});
