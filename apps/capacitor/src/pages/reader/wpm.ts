import { SETTING_CONSTRAINTS } from "@lesefluss/core";

export const WPM_STEP = 25;

export function clampWpm(n: number): number {
	return Math.min(SETTING_CONSTRAINTS.WPM.max, Math.max(SETTING_CONSTRAINTS.WPM.min, n));
}
