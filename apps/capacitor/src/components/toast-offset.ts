/** Fixed bottom controls a toast must sit above carry this attribute. */
export const TOAST_CLEAR_ATTR = "data-toast-clear";

const CSS_VAR = "--toast-bottom";
const GAP_PX = 8;
// The pill's width: capped at 380px by toast.css, inside sonner's 16px phone gutters.
const COLUMN_MAX_PX = 380;
const GUTTER_PX = 16;

/**
 * Pixels from the viewport bottom to the top of the highest visible fixed
 * control under the toast column, or 0 when none is there. Controls in the top
 * half are headers, not bars, and never push a toast up.
 */
export function measureToastLift(): number {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const half = Math.min(vw - 2 * GUTTER_PX, COLUMN_MAX_PX) / 2;
	const left = vw / 2 - half;
	const right = vw / 2 + half;
	let lift = 0;
	for (const el of document.querySelectorAll<HTMLElement>(`[${TOAST_CLEAR_ATTR}]`)) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		if (r.top < vh / 2 || r.right <= left || r.left >= right) continue;
		lift = Math.max(lift, vh - r.top);
	}
	return lift;
}

let lastValue = "";

export function updateToastBottom(): void {
	const lift = measureToastLift();
	const value =
		lift > 0 ? `${Math.ceil(lift) + GAP_PX}px` : `calc(var(--safe-bottom, 0px) + ${GAP_PX + 4}px)`;
	if (value === lastValue && document.documentElement.style.getPropertyValue(CSS_VAR)) return;
	lastValue = value;
	document.documentElement.style.setProperty(CSS_VAR, value);
}
