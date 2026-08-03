/**
 * Pure two-finger-tap detector fed by native touch events. DOM-type-free so
 * it runs under happy-dom (no Touch/TouchEvent constructors needed).
 *
 * A "two-finger tap" is: exactly two concurrent touches, landed within
 * MAX_STAGGER_MS of each other, neither moving more than MAX_MOVE_PX from its
 * own start, all lifted within MAX_TAP_DURATION_MS of the second landing.
 * The stagger limit is what rejects a second finger landing mid-drag: a
 * finger that has been down for seconds can never form a tap pair.
 */

export type TouchLike = {
	identifier: number;
	clientX: number;
	clientY: number;
};

export type TouchEvtLike = {
	/** Touches still on the surface after this event. */
	touches: ArrayLike<TouchLike>;
	/** Touches that changed in this event. */
	changedTouches: ArrayLike<TouchLike>;
	timeStamp: number;
};

export const MAX_TAP_DURATION_MS = 300;
export const MAX_MOVE_PX = 30;
export const MAX_STAGGER_MS = 150;

type TouchStart = { x: number; y: number; t: number };

export type TwoFingerTapDetector = {
	touchstart(e: TouchEvtLike): void;
	touchmove(e: TouchEvtLike): void;
	touchend(e: TouchEvtLike): void;
	touchcancel(): void;
	reset(): void;
};

export function createTwoFingerTapDetector(onTrigger: () => void): TwoFingerTapDetector {
	const starts = new Map<number, TouchStart>();
	let isArmed = false;
	let armedAtMs = 0;

	const reset = () => {
		starts.clear();
		isArmed = false;
	};

	return {
		touchstart(e) {
			for (let i = 0; i < e.changedTouches.length; i++) {
				const t = e.changedTouches[i];
				starts.set(t.identifier, { x: t.clientX, y: t.clientY, t: e.timeStamp });
			}
			if (e.touches.length === 2) {
				const a = starts.get(e.touches[0].identifier);
				const b = starts.get(e.touches[1].identifier);
				isArmed = a !== undefined && b !== undefined && Math.abs(a.t - b.t) <= MAX_STAGGER_MS;
				armedAtMs = e.timeStamp;
			} else {
				isArmed = false;
			}
		},

		touchmove(e) {
			if (!isArmed) return;
			for (let i = 0; i < e.changedTouches.length; i++) {
				const t = e.changedTouches[i];
				const start = starts.get(t.identifier);
				if (!start) continue;
				if (
					Math.abs(t.clientX - start.x) > MAX_MOVE_PX ||
					Math.abs(t.clientY - start.y) > MAX_MOVE_PX
				) {
					isArmed = false;
					return;
				}
			}
		},

		touchend(e) {
			for (let i = 0; i < e.changedTouches.length; i++) {
				starts.delete(e.changedTouches[i].identifier);
			}
			if (e.touches.length > 0) return;
			const shouldFire = isArmed && e.timeStamp - armedAtMs <= MAX_TAP_DURATION_MS;
			reset();
			if (shouldFire) onTrigger();
		},

		touchcancel() {
			reset();
		},

		reset,
	};
}
