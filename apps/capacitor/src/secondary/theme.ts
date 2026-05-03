/**
 * Mirrors the reader theme palette from `monochrome.css`. Kept in TS so the
 * secondary doesn't need to ship the Ionic CSS bundle.
 */

export type ThemeName = "dark" | "sepia" | "light";

export interface Colors {
	bg: string;
	text: string;
	heading: string;
	muted: string;
	progressBg: string;
	progressFill: string;
}

const PALETTES: Record<ThemeName, Colors> = {
	dark:  { bg: "#1a1a1a", text: "#e4e4e4", heading: "#f0f0f0", muted: "#888888", progressBg: "#333333", progressFill: "#d0d0d0" },
	sepia: { bg: "#c4b081", text: "#3a2e1e", heading: "#2d2112", muted: "#8a7a63", progressBg: "#d2c3a4", progressFill: "#7a5f3d" },
	light: { bg: "#ffffff", text: "#111111", heading: "#111111", muted: "#555555", progressBg: "#e0e0e0", progressFill: "#000000" },
};

export function palette(name: ThemeName): Colors {
	return PALETTES[name] ?? PALETTES.dark;
}
