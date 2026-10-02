import { drawerSnapPoints } from "@lesefluss/ui/drawer";
import { describe, expect, it } from "vitest";

const SHEET_HEIGHT = 0.85;

// What vaul shows of an 85vh sheet at snap `s`: it translates by (1 - s) screens.
const visibleShare = (snap: number) => SHEET_HEIGHT - (1 - snap);

describe("drawerSnapPoints", () => {
	it("shows the requested share of the screen", () => {
		for (const [requested, snap] of [0.3, 0.5].map((v) => [v, drawerSnapPoints([v])[0]])) {
			expect(visibleShare(snap)).toBeCloseTo(requested);
		}
	});

	it("shows the whole sheet at the top snap", () => {
		expect(drawerSnapPoints([0.5, 1])[1]).toBe(1);
		expect(drawerSnapPoints([0.95])[0]).toBe(1);
	});
});
