import { DEFAULT_SETTINGS, type PaginationStyle, SETTING_CONSTRAINTS } from "@lesefluss/core";
import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import type React from "react";
import { type AppTheme, useTheme } from "../contexts/theme-context";
import { queryHooks } from "../services/db/hooks";
import type { Settings } from "../services/db/schema";

export const THEMES: { value: AppTheme; label: string; short?: string }[] = [
	{ value: "dark", label: "Dark" },
	{ value: "sepia", label: "Sepia" },
	{ value: "light", label: "Light" },
	// `short`: the appearance popover's four-across row has no room for the full name.
	{ value: "high-contrast", label: "High contrast", short: "Contrast" },
];

const SERIF_STACK = "Georgia, 'Times New Roman', serif";

type FontFamily = {
	value: string;
	label: string;
	/** The full name, for assistive tech where `label` is short. */
	name: string;
	/** CSS font-family; undefined inherits the app's sans. */
	stack?: string;
	/** The bundled face (theme/reader-fonts.ts) to load before laying text out in it. */
	face?: string;
};

export const FONT_FAMILIES: FontFamily[] = [
	{ value: "sans", label: "Sans", name: "Sans" },
	{ value: "serif", label: "Serif", name: "Serif", stack: SERIF_STACK },
	{
		value: "atkinson",
		label: "Atkinson",
		name: "Atkinson Hyperlegible",
		stack: "'Atkinson Hyperlegible', sans-serif",
		face: "Atkinson Hyperlegible",
	},
	{
		value: "opendyslexic",
		label: "OpenDyslexic",
		name: "OpenDyslexic",
		stack: "OpenDyslexic, sans-serif",
		face: "OpenDyslexic",
	},
	{
		value: "literata",
		label: "Literata",
		name: "Literata",
		stack: `Literata, ${SERIF_STACK}`,
		face: "Literata",
	},
];

const fontFamilyOf = (family: string) => FONT_FAMILIES.find((f) => f.value === family);

/** CSS font-family for the reader's `readerFontFamily` setting; undefined = inherit app sans. */
export const readerFontStack = (family: string) => fontFamilyOf(family)?.stack;

/** The bundled face behind a reader font, or undefined for a system one. */
export const readerFontFace = (family: string) => fontFamilyOf(family)?.face;

/**
 * A font synced from a newer app version that this build doesn't know reads
 * as the default, so the reader and the pickers agree on what is shown.
 */
export function readerFontFamilyFor(raw: string | undefined): string {
	return (raw && fontFamilyOf(raw)?.value) ?? DEFAULT_SETTINGS.READER_FONT_FAMILY;
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

/** Round to one decimal place to avoid floating-point drift in step arithmetic. */
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** One stepper press: the value moved by `delta`, rounded, kept in range. */
export function stepSetting(
	value: number,
	delta: number,
	range: { min: number; max: number },
	round: (n: number) => number,
): number {
	return clamp(round(value + delta), range.min, range.max);
}

/**
 * A stored value moved onto its stepper's grid (counted from `min`) and into
 * range, so an off-grid value from sync or an older build steps the same way
 * in the popover and in Settings.
 */
export function snapSetting(
	value: number,
	range: { min: number; max: number; step: number },
	round: (n: number) => number,
): number {
	return stepSetting(
		range.min + Math.round((value - range.min) / range.step) * range.step,
		0,
		range,
		round,
	);
}

/** Letter, word and paragraph spacing, in em of the reader's font size. */
export type TextSpacing = { letter: number; word: number; paragraph: number };

export const DEFAULT_TEXT_SPACING: TextSpacing = {
	letter: DEFAULT_SETTINGS.READER_LETTER_SPACING,
	word: DEFAULT_SETTINGS.READER_WORD_SPACING,
	paragraph: DEFAULT_SETTINGS.READER_PARAGRAPH_SPACING,
};

/**
 * The spacing the reader renders, rounded and kept in range: the steppers'
 * comparisons, the layout keys and the CSS all see the same values, whatever
 * float a sync or an older build stored.
 */
export function textSpacingFor(
	settings:
		| Partial<
				Pick<Settings, "readerLetterSpacing" | "readerWordSpacing" | "readerParagraphSpacing">
		  >
		| undefined,
): TextSpacing {
	const { READER_LETTER_SPACING, READER_WORD_SPACING, READER_PARAGRAPH_SPACING } =
		SETTING_CONSTRAINTS;
	return {
		letter: snapSetting(
			settings?.readerLetterSpacing ?? DEFAULT_TEXT_SPACING.letter,
			READER_LETTER_SPACING,
			round2,
		),
		word: snapSetting(
			settings?.readerWordSpacing ?? DEFAULT_TEXT_SPACING.word,
			READER_WORD_SPACING,
			round2,
		),
		paragraph: snapSetting(
			settings?.readerParagraphSpacing ?? DEFAULT_TEXT_SPACING.paragraph,
			READER_PARAGRAPH_SPACING,
			round1,
		),
	};
}

/** A spacing's value column: "Default" when it renders as without the setting. */
export function spacingLabel(value: number, fallback: number, format: (v: number) => string) {
	return value === fallback ? "Default" : format(value);
}

/**
 * The CSS variables `.reader-paragraph` reads. Set on the reader container, they
 * resolve in em at each paragraph; no added letter or word spacing sets nothing,
 * so the text renders exactly as without them.
 */
export function textSpacingVars(spacing: TextSpacing): React.CSSProperties {
	return {
		...(spacing.letter > 0 && { "--reader-letter-spacing": `${spacing.letter}em` }),
		...(spacing.word > 0 && { "--reader-word-spacing": `${spacing.word}em` }),
		"--reader-paragraph-spacing": `${spacing.paragraph}em`,
	} as React.CSSProperties;
}

// About 30 characters: below that, justify stretches the few gaps of a line into holes.
const JUSTIFY_MIN_LINE_EM = 16;

/** Justify only where a line holds enough words to spread the space; left otherwise. */
export function effectiveTextAlign(
	align: TextAlign,
	lineWidthPx: number,
	fontSizePx: number,
	letterSpacingEm: number,
): TextAlign {
	if (align !== "justify") return "left";
	return lineWidthPx / (fontSizePx * (1 + 2 * letterSpacingEm)) >= JUSTIFY_MIN_LINE_EM
		? "justify"
		: "left";
}

/** Justified text hyphenates; left-aligned text breaks only between words. */
export function textAlignVars(align: TextAlign): React.CSSProperties {
	return (
		align === "justify" ? { "--reader-text-align": "justify", "--reader-hyphens": "auto" } : {}
	) as React.CSSProperties;
}

/** Added spacing in em, shown as a share of the font size. */
export const percentOfFont = (em: number) => `${Math.round(em * 100)}%`;

/** Part of every layout key: a spacing change re-lays out the text like a font size change. */
export const textSpacingKey = (spacing: TextSpacing) =>
	`${spacing.letter}|${spacing.word}|${spacing.paragraph}`;

/** Why the page animation control is off and disabled under OS reduce motion. */
export const PAGE_TURN_REDUCE_MOTION_HINT = "Off while system reduce motion is on";

/**
 * The reader layout in effect. E-ink mode forces page mode with instant turns,
 * and the OS reduce-motion setting forces instant turns; the stored values are
 * left alone (pagination syncs to other devices) and come back when the mode
 * or setting is turned off. `pageTurnAnimationOffBy` names what forces turns
 * instant, for the controls to say so.
 */
export function readerLayoutFor(
	settings: Pick<Settings, "paginationStyle" | "pageTurnAnimation"> | undefined,
	isEinkMode: boolean,
	isOsMotionReduced = false,
): {
	paginationStyle: PaginationStyle;
	pageTurnAnimation: boolean;
	pageTurnAnimationOffBy: "eink" | "reduce-motion" | null;
} {
	if (isEinkMode) {
		return { paginationStyle: "page", pageTurnAnimation: false, pageTurnAnimationOffBy: "eink" };
	}
	const paginationStyle = settings?.paginationStyle ?? DEFAULT_SETTINGS.PAGINATION_STYLE;
	if (isOsMotionReduced) {
		return { paginationStyle, pageTurnAnimation: false, pageTurnAnimationOffBy: "reduce-motion" };
	}
	return {
		paginationStyle,
		pageTurnAnimation: settings?.pageTurnAnimation ?? DEFAULT_SETTINGS.PAGE_TURN_ANIMATION,
		pageTurnAnimationOffBy: null,
	};
}

export type VolumeKeys = { enabled: boolean; invert: boolean };

/** Unset follows E-ink mode: e-readers have page buttons, phones use volume as volume. */
export function volumeKeysFor(
	settings: Pick<Settings, "volumeKeyPageTurn" | "volumeKeyInvert"> | undefined,
	isEinkMode: boolean,
): VolumeKeys {
	return {
		enabled: settings?.volumeKeyPageTurn ?? isEinkMode,
		invert: settings?.volumeKeyInvert ?? DEFAULT_SETTINGS.VOLUME_KEY_INVERT,
	};
}

export type TextAlign = "left" | "justify";

/** Narrows a stored value; anything unknown (a newer client's option) reads as left. */
export function textAlignFor(value: string | null | undefined): TextAlign {
	return value === "justify" ? "justify" : "left";
}

export type ReadingRulerSetting = { isOn: boolean; lines: number };

/** Narrows the stored ruler settings; a line count out of range (a newer client's) is clamped. */
export function readingRulerFor(
	settings: { readerRuler?: boolean | null; readerRulerLines?: number | null } | undefined,
): ReadingRulerSetting {
	const { min, max } = SETTING_CONSTRAINTS.READER_RULER_LINES;
	const lines = Math.round(settings?.readerRulerLines ?? DEFAULT_SETTINGS.READER_RULER_LINES);
	return {
		isOn: settings?.readerRuler ?? DEFAULT_SETTINGS.READER_RULER,
		lines: Number.isFinite(lines) ? Math.min(max, Math.max(min, lines)) : min,
	};
}

export function useAppearanceSettings() {
	const { data: settings } = queryHooks.useSettings();
	const { mutate } = queryHooks.useSaveSettings();

	const fontSize = settings?.readerFontSize ?? DEFAULT_SETTINGS.READER_FONT_SIZE;
	const appFontSize = settings?.appFontSize ?? DEFAULT_SETTINGS.APP_FONT_SIZE;
	const fontFamily = readerFontFamilyFor(settings?.readerFontFamily);
	const isBold = settings?.readerBold ?? DEFAULT_SETTINGS.READER_BOLD;
	const textAlign = textAlignFor(settings?.readerTextAlign);
	const readingRuler = readingRulerFor(settings);
	const showReadingTime = settings?.showReadingTime ?? DEFAULT_SETTINGS.SHOW_READING_TIME;
	// round1 applied on read so disabled comparisons are reliable despite floating-point drift
	const lineSpacing = round1(settings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING);
	const margin = settings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;
	const {
		letter: letterSpacing,
		word: wordSpacing,
		paragraph: paragraphSpacing,
	} = textSpacingFor(settings);
	const showActiveWordUnderline =
		settings?.readerActiveWordUnderline ?? DEFAULT_SETTINGS.READER_ACTIVE_WORD_UNDERLINE;
	const showGlossaryUnderline =
		settings?.readerGlossaryUnderline ?? DEFAULT_SETTINGS.READER_GLOSSARY_UNDERLINE;
	const { isEinkMode } = useTheme();
	// Covers e-ink too, which readerLayoutFor checks first.
	const isMotionReduced = usePrefersReducedMotion();
	const { paginationStyle, pageTurnAnimation, pageTurnAnimationOffBy } = readerLayoutFor(
		settings,
		isEinkMode,
		isMotionReduced,
	);
	const volumeKeys = volumeKeysFor(settings, isEinkMode);

	const adjustFontSize = (delta: number) => {
		mutate({
			readerFontSize: clamp(
				fontSize + delta,
				SETTING_CONSTRAINTS.READER_FONT_SIZE.min,
				SETTING_CONSTRAINTS.READER_FONT_SIZE.max,
			),
		});
	};

	const adjustAppFontSize = (delta: number) => {
		mutate({
			appFontSize: clamp(
				appFontSize + delta,
				SETTING_CONSTRAINTS.APP_FONT_SIZE.min,
				SETTING_CONSTRAINTS.APP_FONT_SIZE.max,
			),
		});
	};

	const adjustLineSpacing = (delta: number) => {
		mutate({
			readerLineSpacing: stepSetting(
				lineSpacing,
				delta,
				SETTING_CONSTRAINTS.READER_LINE_SPACING,
				round1,
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

	const adjustLetterSpacing = (delta: number) => {
		mutate({
			readerLetterSpacing: stepSetting(
				letterSpacing,
				delta,
				SETTING_CONSTRAINTS.READER_LETTER_SPACING,
				round2,
			),
		});
	};

	const adjustWordSpacing = (delta: number) => {
		mutate({
			readerWordSpacing: stepSetting(
				wordSpacing,
				delta,
				SETTING_CONSTRAINTS.READER_WORD_SPACING,
				round2,
			),
		});
	};

	const adjustParagraphSpacing = (delta: number) => {
		mutate({
			readerParagraphSpacing: stepSetting(
				paragraphSpacing,
				delta,
				SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING,
				round1,
			),
		});
	};

	// One save, so sync and the reflow see one change.
	const resetTextSpacing = () => {
		mutate({
			readerLetterSpacing: DEFAULT_TEXT_SPACING.letter,
			readerWordSpacing: DEFAULT_TEXT_SPACING.word,
			readerParagraphSpacing: DEFAULT_TEXT_SPACING.paragraph,
		});
	};

	const setFontFamily = (v: string) => {
		if (v !== settings?.readerFontFamily) mutate({ readerFontFamily: v });
	};

	const setBold = (v: boolean) => {
		mutate({ readerBold: v });
	};

	const setTextAlign = (v: TextAlign) => {
		mutate({ readerTextAlign: v });
	};

	const setReadingRuler = (v: boolean) => {
		mutate({ readerRuler: v });
	};

	const setReadingRulerLines = (v: number) => {
		mutate({ readerRulerLines: v });
	};

	const setPaginationStyle = (v: PaginationStyle) => {
		mutate({ paginationStyle: v });
	};

	const setShowReadingTime = (v: boolean) => {
		mutate({ showReadingTime: v });
	};

	const setShowActiveWordUnderline = (v: boolean) => {
		mutate({ readerActiveWordUnderline: v });
	};

	const setShowGlossaryUnderline = (v: boolean) => {
		mutate({ readerGlossaryUnderline: v });
	};

	const setPageTurnAnimation = (v: boolean) => {
		mutate({ pageTurnAnimation: v });
	};

	const setEinkMode = (v: boolean) => {
		mutate({ einkMode: v });
	};

	const setVolumeKeyPageTurn = (v: boolean) => {
		mutate({ volumeKeyPageTurn: v });
	};

	const setVolumeKeyInvert = (v: boolean) => {
		mutate({ volumeKeyInvert: v });
	};

	return {
		fontSize,
		appFontSize,
		fontFamily,
		isBold,
		textAlign,
		readingRuler,
		lineSpacing,
		margin,
		letterSpacing,
		wordSpacing,
		paragraphSpacing,
		paginationStyle,
		showReadingTime,
		showActiveWordUnderline,
		showGlossaryUnderline,
		pageTurnAnimation,
		pageTurnAnimationOffBy,
		isMotionReduced,
		isEinkMode,
		volumeKeys,
		adjustFontSize,
		adjustAppFontSize,
		adjustLineSpacing,
		adjustMargin,
		adjustLetterSpacing,
		adjustWordSpacing,
		adjustParagraphSpacing,
		resetTextSpacing,
		setFontFamily,
		setBold,
		setTextAlign,
		setReadingRuler,
		setReadingRulerLines,
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
		setShowGlossaryUnderline,
		setPageTurnAnimation,
		setEinkMode,
		setVolumeKeyPageTurn,
		setVolumeKeyInvert,
	};
}
