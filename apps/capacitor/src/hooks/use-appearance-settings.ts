import type React from "react";
import type { AppTheme } from "../contexts/theme-context";
import { queryHooks } from "../services/db/hooks";
import { DEFAULT_SETTINGS, SETTING_CONSTRAINTS } from "@rsvp/rsvp-core";

export const THEMES: { value: AppTheme; label: string }[] = [
	{ value: "dark", label: "Dark" },
	{ value: "sepia", label: "Sepia" },
	{ value: "light", label: "Light" },
];

export const FONT_FAMILIES: { value: string; label: string; style?: React.CSSProperties }[] = [
	{ value: "sans", label: "Sans" },
	{ value: "serif", label: "Serif", style: { fontFamily: "Georgia, serif" } },
];

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

/** Round to one decimal place to avoid floating-point drift in step arithmetic. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function useAppearanceSettings() {
	const { data: settings } = queryHooks.useSettings();
	const { mutate } = queryHooks.useSaveSettings();

	const fontSize = settings?.readerFontSize ?? DEFAULT_SETTINGS.READER_FONT_SIZE;
	const fontFamily = settings?.readerFontFamily ?? DEFAULT_SETTINGS.READER_FONT_FAMILY;
	const showReadingTime = settings?.showReadingTime ?? DEFAULT_SETTINGS.SHOW_READING_TIME;
	// round1 applied on read so disabled comparisons are reliable despite floating-point drift
	const lineSpacing = round1(settings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING);
	const margin = settings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;

	const adjustFontSize = (delta: number) => {
		mutate({
			readerFontSize: clamp(
				fontSize + delta,
				SETTING_CONSTRAINTS.READER_FONT_SIZE.min,
				SETTING_CONSTRAINTS.READER_FONT_SIZE.max,
			),
		});
	};

	const adjustLineSpacing = (delta: number) => {
		mutate({
			readerLineSpacing: clamp(
				round1(lineSpacing + delta),
				SETTING_CONSTRAINTS.READER_LINE_SPACING.min,
				SETTING_CONSTRAINTS.READER_LINE_SPACING.max,
			),
		});
	};

	const adjustMargin = (delta: number) => {
		mutate({
			readerMargin: clamp(
				margin + delta,
				SETTING_CONSTRAINTS.READER_MARGIN.min,
				SETTING_CONSTRAINTS.READER_MARGIN.max,
			),
		});
	};

	const setFontFamily = (v: string) => {
		mutate({ readerFontFamily: v });
	};

	const setShowReadingTime = (v: boolean) => {
		mutate({ showReadingTime: v });
	};

	return {
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		showReadingTime,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setShowReadingTime,
	};
}
