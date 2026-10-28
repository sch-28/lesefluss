import { describe, expect, it } from "vitest";
import { pageCountOf, pageGeometry, relativeOffsets, SPREAD_MIN_WIDTH } from "../chunks";

describe("pageGeometry", () => {
	it("lays out one page, capped at 700px, below the breakpoint", () => {
		expect(pageGeometry(400, 20)).toEqual({
			width: 400,
			columnsPerPage: 1,
			columnWidth: 360,
			columnGap: 0,
			columnStride: 360,
			pageStride: 360,
		});
		expect(pageGeometry(SPREAD_MIN_WIDTH - 1, 20).width).toBe(700);
	});

	it("lays out a two-page spread, capped at 1400px, from the breakpoint", () => {
		expect(pageGeometry(SPREAD_MIN_WIDTH, 20)).toEqual({
			width: 900,
			columnsPerPage: 2,
			columnWidth: 410,
			columnGap: 40,
			columnStride: 450,
			pageStride: 900,
		});
		expect(pageGeometry(2000, 20).width).toBe(1400);
	});

	it("keeps a fractional width unrounded", () => {
		const g = pageGeometry(411.43, 20);
		expect(g.columnWidth).toBeCloseTo(371.43);
		expect(g.pageStride).toBe(g.columnWidth);
	});
});

describe("pageCountOf", () => {
	it("counts whole pages, and a partial last page as one", () => {
		expect(pageCountOf(0, 300)).toBe(1);
		expect(pageCountOf(300, 300)).toBe(1);
		expect(pageCountOf(301.5, 300)).toBe(2);
		expect(pageCountOf(2100, 300)).toBe(7);
	});

	it("does not count a phantom page when scrollWidth rounds up at a fractional stride", () => {
		// Chromium reports 7 columns of 300.5px as 2104 (rounded up from 2103.5).
		expect(pageCountOf(2104, 300.5)).toBe(7);
		expect(pageCountOf(Math.ceil(12 * 371.43), 371.43)).toBe(12);
		expect(pageCountOf(Math.floor(12 * 371.43), 371.43)).toBe(12);
	});

	it("counts a half-filled last spread as a page", () => {
		const { columnWidth, columnGap, pageStride } = pageGeometry(1280, 20);
		// scrollWidth reaches the right edge of the last column, not the stride.
		const scrollWidth = (columns: number) => columns * columnWidth + (columns - 1) * columnGap;
		expect(pageCountOf(scrollWidth(1), pageStride)).toBe(1);
		expect(pageCountOf(scrollWidth(2), pageStride)).toBe(1);
		expect(pageCountOf(scrollWidth(3), pageStride)).toBe(2);
		expect(pageCountOf(Math.ceil(scrollWidth(8)), pageStride)).toBe(4);
		expect(pageCountOf(Math.ceil(scrollWidth(9)), pageStride)).toBe(5);
	});
});

describe("relativeOffsets", () => {
	it("places the neighbours side by side around the current chunk", () => {
		const widths = new Map([
			[3, 900],
			[4, 1800],
			[5, 2700],
		]);
		expect(relativeOffsets([3, 4, 5], 4, widths, 900)).toEqual(
			new Map([
				[3, -900],
				[4, 0],
				[5, 1800],
			]),
		);
	});
});
