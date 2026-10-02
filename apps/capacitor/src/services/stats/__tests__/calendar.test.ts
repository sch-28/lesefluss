import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildMonthGrid,
	buildWeekStrip,
	type DailyReading,
	NO_READING,
	shiftMonth,
} from "../calendar";

const ORIGINAL_TZ = process.env.TZ;
const MINUTE = 60_000;

function useTimezone(tz: string) {
	beforeAll(() => {
		process.env.TZ = tz;
	});
	afterAll(() => {
		process.env.TZ = ORIGINAL_TZ;
	});
}

function monthOf(year: number, month: number): number {
	return new Date(year, month - 1, 1).getTime();
}

/** Minutes keyed by YYYY-MM-DD; every day with time counts as read. */
function readDays(entries: Record<string, number>): DailyReading {
	const msByDay = new Map(Object.entries(entries).map(([key, minutes]) => [key, minutes * MINUTE]));
	return {
		msByDay,
		readDays: new Set([...msByDay].filter(([, ms]) => ms > 0).map(([key]) => key)),
	};
}

describe("buildMonthGrid", () => {
	useTimezone("Europe/Berlin");

	it("pads to whole Monday-first weeks", () => {
		// 1 May 2026 is a Friday, so Monday-first padding is four days.
		const grid = buildMonthGrid(NO_READING, monthOf(2026, 5));
		expect(grid.length % 7).toBe(0);
		expect(new Date(grid[0]?.dayStart ?? 0).getDay()).toBe(1);
		expect(grid.filter((day) => day.isInMonth)).toHaveLength(31);
		expect(grid[0]?.isInMonth).toBe(false);
	});

	it("marks the padding days as outside the month", () => {
		const grid = buildMonthGrid(NO_READING, monthOf(2026, 5));
		const first = grid.findIndex((day) => day.isInMonth);
		expect(first).toBe(4);
		expect(new Date(grid[first]?.dayStart ?? 0).getDate()).toBe(1);
	});

	it("grades intensity by how much was read", () => {
		const grid = buildMonthGrid(
			readDays({ "2026-05-04": 5, "2026-05-05": 30, "2026-05-06": 120 }),
			monthOf(2026, 5),
		);
		const on = (key: string) => grid.find((day) => day.dateKey === key);
		expect(on("2026-05-04")?.intensity).toBe(1);
		expect(on("2026-05-05")?.intensity).toBe(2);
		expect(on("2026-05-06")?.intensity).toBe(3);
		expect(on("2026-05-07")?.intensity).toBe(0);
	});

	it("puts the step boundaries in the lower band", () => {
		const grid = buildMonthGrid(readDays({ "2026-05-04": 15, "2026-05-05": 45 }), monthOf(2026, 5));
		expect(grid.find((day) => day.dateKey === "2026-05-04")?.intensity).toBe(1);
		expect(grid.find((day) => day.dateKey === "2026-05-05")?.intensity).toBe(2);
	});

	it("links consecutive read days and leaves gaps unlinked", () => {
		const grid = buildMonthGrid(
			readDays({ "2026-05-11": 20, "2026-05-12": 20, "2026-05-14": 20 }),
			monthOf(2026, 5),
		);
		const on = (key: string) => grid.find((day) => day.dateKey === key);
		expect(on("2026-05-11")).toMatchObject({ linksBefore: false, linksAfter: true });
		expect(on("2026-05-12")).toMatchObject({ linksBefore: true, linksAfter: false });
		expect(on("2026-05-14")).toMatchObject({ linksBefore: false, linksAfter: false });
	});

	// A streak running into the month must not appear to start on the 1st.
	// June 2026 begins on a Monday, so there is no padding: the previous day is
	// genuinely outside the grid and a lookback clamped to index 0 would miss it.
	it("links backwards past the first cell of the grid", () => {
		const grid = buildMonthGrid(readDays({ "2026-05-31": 20, "2026-06-01": 20 }), monthOf(2026, 6));
		expect(grid[0]?.dateKey).toBe("2026-06-01");
		expect(grid[0]?.linksBefore).toBe(true);
	});

	it("links forwards past the last cell of the grid", () => {
		// May 2026's grid ends on 31 May; 1 June is outside it.
		const grid = buildMonthGrid(readDays({ "2026-05-31": 20, "2026-06-01": 20 }), monthOf(2026, 5));
		expect(grid[grid.length - 1]?.dateKey).toBe("2026-05-31");
		expect(grid[grid.length - 1]?.linksAfter).toBe(true);
	});

	// The streak counts any saved sitting, so the grid must light up a short day
	// too, or it draws a gap under a streak that never broke.
	it("counts a day with a short sitting as read", () => {
		const grid = buildMonthGrid(
			readDays({ "2026-05-11": 20, "2026-05-12": 0.5, "2026-05-13": 20 }),
			monthOf(2026, 5),
		);
		const on = (key: string) => grid.find((day) => day.dateKey === key);
		expect(on("2026-05-12")?.intensity).toBe(1);
		expect(on("2026-05-11")?.linksAfter).toBe(true);
		expect(on("2026-05-13")?.linksBefore).toBe(true);
	});

	// A sitting at 02:00 on the 13th reads the 12th too, which has no time of its own.
	it("lights up a day credited only by a late-night sitting", () => {
		const daily = readDays({ "2026-05-11": 20, "2026-05-13": 20 });
		const grid = buildMonthGrid(
			{ ...daily, readDays: new Set([...daily.readDays, "2026-05-12"]) },
			monthOf(2026, 5),
		);
		const on = (key: string) => grid.find((day) => day.dateKey === key);
		expect(on("2026-05-12")).toMatchObject({ intensity: 1, linksBefore: true, linksAfter: true });
	});

	it("marks a frozen day and links the streak across it", () => {
		const grid = buildMonthGrid(
			readDays({ "2026-05-11": 20, "2026-05-13": 20 }),
			monthOf(2026, 5),
			new Set(["2026-05-12"]),
		);
		const on = (key: string) => grid.find((day) => day.dateKey === key);
		expect(on("2026-05-12")).toMatchObject({
			intensity: 0,
			isFrozen: true,
			linksBefore: true,
			linksAfter: true,
		});
		expect(on("2026-05-11")?.linksAfter).toBe(true);
		expect(on("2026-05-13")?.linksBefore).toBe(true);
	});

	it("never links an unread day", () => {
		const grid = buildMonthGrid(readDays({ "2026-05-11": 20, "2026-05-13": 20 }), monthOf(2026, 5));
		const gap = grid.find((day) => day.dateKey === "2026-05-12");
		expect(gap).toMatchObject({ intensity: 0, linksBefore: false, linksAfter: false });
	});
});

describe("buildMonthGrid across a DST transition", () => {
	// Europe/Berlin springs forward on 29 March 2026: that day is 23 hours long.
	// Stepping by fixed milliseconds would land a cell on the wrong date.
	useTimezone("Europe/Berlin");

	it("starts every cell of a short-day month at local midnight", () => {
		const grid = buildMonthGrid(NO_READING, monthOf(2026, 3));
		const inMonth = grid.filter((day) => day.isInMonth);
		expect(inMonth).toHaveLength(31);
		// Spring-forward only drifts a ms-stepped cell to 01:00, which still keys
		// to the right date. The hour is what gives this case any teeth.
		expect(inMonth.every((day) => new Date(day.dayStart).getHours() === 0)).toBe(true);
	});

	it("keeps every day of a long-day month on its own date", () => {
		// 25 October 2026 is 25 hours long. Stepping by 24h emits it twice and
		// pushes the 26th off the end, so the length assertion is the one that
		// catches it: a duplicate leaves the distinct-key count at 31.
		const grid = buildMonthGrid(NO_READING, monthOf(2026, 10));
		const inMonth = grid.filter((day) => day.isInMonth);
		expect(inMonth).toHaveLength(31);
		expect(new Set(inMonth.map((day) => day.dateKey)).size).toBe(31);
		expect(inMonth.some((day) => day.dateKey === "2026-10-26")).toBe(true);
	});
});

describe("buildWeekStrip", () => {
	useTimezone("Europe/Berlin");

	function dayOf(year: number, month: number, day: number): number {
		return new Date(year, month - 1, day).getTime();
	}

	it("starts the strip on the Monday of the containing week", () => {
		// 13 May 2026 is a Wednesday.
		const week = buildWeekStrip(NO_READING, dayOf(2026, 5, 13));
		expect(week).toHaveLength(7);
		expect(week[0]?.dateKey).toBe("2026-05-11");
		expect(new Date(week[0]?.dayStart ?? 0).getDay()).toBe(1);
	});

	it("keeps a Sunday in the week that began the previous Monday", () => {
		// 17 May 2026 is a Sunday; Sunday-first getDay() would start a new week here.
		const week = buildWeekStrip(NO_READING, dayOf(2026, 5, 17));
		expect(week[0]?.dateKey).toBe("2026-05-11");
		expect(week[6]?.dateKey).toBe("2026-05-17");
	});

	it("spans a month boundary without dropping days", () => {
		// The week of 1 May 2026 (a Friday) starts on 27 April.
		const week = buildWeekStrip(NO_READING, dayOf(2026, 5, 1));
		expect(week.map((day) => day.dateKey)).toEqual([
			"2026-04-27",
			"2026-04-28",
			"2026-04-29",
			"2026-04-30",
			"2026-05-01",
			"2026-05-02",
			"2026-05-03",
		]);
	});

	it("spans a year boundary", () => {
		// 1 January 2027 is a Friday; its week starts 28 December 2026.
		const week = buildWeekStrip(NO_READING, dayOf(2027, 1, 1));
		expect(week[0]?.dateKey).toBe("2026-12-28");
		expect(week[6]?.dateKey).toBe("2027-01-03");
	});

	it("marks every cell as in-month, even across a boundary", () => {
		const week = buildWeekStrip(NO_READING, dayOf(2026, 5, 1));
		expect(week.every((day) => day.isInMonth)).toBe(true);
	});

	it("links to read days outside the strip", () => {
		// Sunday before and Monday after the strip are both read, so the edge
		// cells must carry connectors pointing off the strip.
		const week = buildWeekStrip(
			readDays({ "2026-05-10": 20, "2026-05-11": 20, "2026-05-17": 20, "2026-05-18": 20 }),
			dayOf(2026, 5, 13),
		);
		expect(week[0]).toMatchObject({ dateKey: "2026-05-11", linksBefore: true });
		expect(week[6]).toMatchObject({ dateKey: "2026-05-17", linksAfter: true });
	});
});

describe("shiftMonth", () => {
	useTimezone("Europe/Berlin");

	it("steps backwards and forwards", () => {
		const may = monthOf(2026, 5);
		expect(shiftMonth(may, -1)).toBe(monthOf(2026, 4));
		expect(shiftMonth(may, 1)).toBe(monthOf(2026, 6));
	});

	it("crosses the year boundary", () => {
		expect(shiftMonth(monthOf(2026, 1), -1)).toBe(monthOf(2025, 12));
		expect(shiftMonth(monthOf(2026, 12), 1)).toBe(monthOf(2027, 1));
	});

	it("normalises to the first of the month", () => {
		const midMonth = new Date(2026, 4, 17, 13, 45).getTime();
		expect(shiftMonth(midMonth, 0)).toBe(monthOf(2026, 5));
	});
});
