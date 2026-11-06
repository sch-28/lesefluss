import { SETTING_CONSTRAINTS } from "@lesefluss/core";

export const WPM_STEP = 25;

export type WpmRange = { min: number; max: number; step: number };

export const RSVP_WPM_RANGE: WpmRange = {
	min: SETTING_CONSTRAINTS.WPM.min,
	max: SETTING_CONSTRAINTS.WPM.max,
	step: WPM_STEP,
};

export const TTS_WPM_RANGE: WpmRange = SETTING_CONSTRAINTS.TTS_WPM;

export function clampToRange(n: number, { min, max }: WpmRange): number {
	return Math.min(max, Math.max(min, n));
}

export function clampWpm(n: number): number {
	return clampToRange(n, RSVP_WPM_RANGE);
}
