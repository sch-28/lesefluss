import { describe, expect, it, vi } from "vitest";
import {
	createTwoFingerTapDetector,
	MAX_MOVE_PX,
	MAX_STAGGER_MS,
	MAX_TAP_DURATION_MS,
	type TouchEvtLike,
	type TouchLike,
} from "./two-finger-tap";

function touch(identifier: number, clientX = 100, clientY = 100): TouchLike {
	return { identifier, clientX, clientY };
}

function evt(touches: TouchLike[], changedTouches: TouchLike[], timeStamp: number): TouchEvtLike {
	return { touches, changedTouches, timeStamp };
}

function cleanTap(d: ReturnType<typeof createTwoFingerTapDetector>, t0 = 0) {
	const f1 = touch(1, 100, 100);
	const f2 = touch(2, 160, 100);
	d.touchstart(evt([f1], [f1], t0));
	d.touchstart(evt([f1, f2], [f2], t0 + 50));
	d.touchend(evt([f2], [f1], t0 + 150));
	d.touchend(evt([], [f2], t0 + 160));
}

describe("createTwoFingerTapDetector", () => {
	it("triggers on a clean two-finger tap", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		cleanTap(d);
		expect(onTrigger).toHaveBeenCalledTimes(1);
	});

	it("triggers exactly once per tap", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		cleanTap(d);
		// A stray trailing touchend with no touches must not re-fire.
		d.touchend(evt([], [], 200));
		expect(onTrigger).toHaveBeenCalledTimes(1);
	});

	it("re-arms for sequential taps", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		cleanTap(d, 0);
		cleanTap(d, 1000);
		expect(onTrigger).toHaveBeenCalledTimes(2);
	});

	it("does not trigger with three fingers", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		const f3 = touch(3);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 20));
		d.touchstart(evt([f1, f2, f3], [f3], 40));
		d.touchend(evt([f2, f3], [f1], 100));
		d.touchend(evt([f3], [f2], 110));
		d.touchend(evt([], [f3], 120));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does not trigger when a finger moves beyond the threshold", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1, 100, 100);
		const f2 = touch(2, 160, 100);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		const moved = touch(1, 100, 100 + MAX_MOVE_PX + 1);
		d.touchmove(evt([moved, f2], [moved], 100));
		d.touchend(evt([f2], [moved], 150));
		d.touchend(evt([], [f2], 160));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("allows small movement within the threshold", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1, 100, 100);
		const f2 = touch(2, 160, 100);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		const jitter = touch(1, 100 + MAX_MOVE_PX - 1, 100);
		d.touchmove(evt([jitter, f2], [jitter], 100));
		d.touchend(evt([f2], [jitter], 150));
		d.touchend(evt([], [f2], 160));
		expect(onTrigger).toHaveBeenCalledTimes(1);
	});

	it("does not trigger when held past the max duration", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		d.touchend(evt([f2], [f1], 50 + MAX_TAP_DURATION_MS + 50));
		d.touchend(evt([], [f2], 50 + MAX_TAP_DURATION_MS + 60));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does not trigger when the second finger lands too late (mid-drag)", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], MAX_STAGGER_MS + 100));
		d.touchend(evt([f2], [f1], MAX_STAGGER_MS + 150));
		d.touchend(evt([], [f2], MAX_STAGGER_MS + 160));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does not trigger while one finger stays down", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		d.touchend(evt([f2], [f1], 100));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does not trigger after touchcancel", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		d.touchcancel();
		d.touchend(evt([], [f1, f2], 100));
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("does not trigger a pair formed by lift-and-retap of one finger", () => {
		const onTrigger = vi.fn();
		const d = createTwoFingerTapDetector(onTrigger);
		const f1 = touch(1);
		const f2 = touch(2);
		const f3 = touch(3);
		// f2 has been down since t=50; f3 lands at t=500 → stagger too large.
		d.touchstart(evt([f1], [f1], 0));
		d.touchstart(evt([f1, f2], [f2], 50));
		d.touchend(evt([f2], [f1], 400));
		d.touchstart(evt([f2, f3], [f3], 500));
		d.touchend(evt([f3], [f2], 550));
		d.touchend(evt([], [f3], 560));
		expect(onTrigger).not.toHaveBeenCalled();
	});
});
