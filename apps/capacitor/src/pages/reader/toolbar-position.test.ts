import { describe, expect, it } from "vitest";
import {
	computeToolbarPosition,
	type ToolbarPositionInput,
	type WordRect,
} from "./toolbar-position";

const rect = (top: number, left: number, width = 40, height = 20): WordRect => ({
	top,
	bottom: top + height,
	left,
	right: left + width,
});

const base = (over: Partial<ToolbarPositionInput>): ToolbarPositionInput => ({
	startRect: rect(300, 100),
	endRect: rect(300, 200),
	toolbar: { width: 200, height: 56 },
	viewport: { width: 400, height: 800 },
	safeTop: 0,
	safeBottom: 0,
	...over,
});

describe("computeToolbarPosition", () => {
	it("sits above the start line, clear of the start handle", () => {
		const { top } = computeToolbarPosition(base({}));
		expect(top).toBe(300 - 10 - 4 - 56);
	});

	it("flips below the end handle when there is no room above", () => {
		const { top } = computeToolbarPosition(
			base({ startRect: rect(40, 100), endRect: rect(90, 200) }),
		);
		expect(top).toBe(110 + 30 + 4);
	});

	it("respects the top safe area when deciding whether it fits above", () => {
		const { top } = computeToolbarPosition(
			base({ startRect: rect(100, 100), endRect: rect(100, 200), safeTop: 40 }),
		);
		expect(top).toBe(120 + 30 + 4);
	});

	it("pins above the bottom safe area when neither side fits", () => {
		const { top } = computeToolbarPosition(
			base({ startRect: rect(20, 100), endRect: rect(760, 200), safeBottom: 24 }),
		);
		expect(top).toBe(800 - 24 - 12 - 56);
	});

	it("centres on the selection", () => {
		const { left } = computeToolbarPosition(base({}));
		expect(left).toBe((100 + 240) / 2 - 100);
	});

	it("clamps to the left edge", () => {
		const { left } = computeToolbarPosition(
			base({ startRect: rect(300, 0, 20), endRect: rect(300, 10, 20) }),
		);
		expect(left).toBe(12);
	});

	it("clamps to the right edge", () => {
		const { left } = computeToolbarPosition(
			base({ startRect: rect(300, 360, 30), endRect: rect(300, 370, 30) }),
		);
		expect(left).toBe(400 - 12 - 200);
	});
});
