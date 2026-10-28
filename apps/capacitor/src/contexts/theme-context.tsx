import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { DEFAULT_SETTINGS, READER_THEMES, type ReaderTheme } from "@lesefluss/core";
import { EINK_CLASS } from "@lesefluss/ui/use-prefers-reduced-motion";
import { MotionConfig } from "framer-motion";
import type React from "react";
import { createContext, useCallback, useContext, useEffect } from "react";
import { queryHooks } from "../services/db/hooks";
import { log } from "../utils/log";

export type AppTheme = ReaderTheme;

const THEME_CACHE_KEY = "app-theme";
const EINK_CACHE_KEY = "app-eink";

export function isAppTheme(raw: string | undefined): raw is AppTheme {
	return READER_THEMES.some((t) => t === raw);
}

export function isDarkTheme(theme: AppTheme): boolean {
	return theme === "dark" || theme === "high-contrast";
}

/**
 * Focal-letter presets under 7:1 on high contrast's black (red 5.3, blue 6.3),
 * lightened there only; the synced setting keeps the user's pick.
 */
const HIGH_CONTRAST_FOCAL: Record<string, string> = {
	"#ff0000": "#ff6b6b",
	"#448aff": "#82b1ff",
};

export function focalLetterColorFor(color: string, theme: AppTheme): string {
	return theme === "high-contrast" ? (HIGH_CONTRAST_FOCAL[color.toLowerCase()] ?? color) : color;
}

/**
 * The classes a theme puts on <html> and <body>; index.html mirrors this for
 * first paint. High contrast counts as dark, so it carries `dark` too and every
 * dark: variant, body.dark rule and chart branch applies to it.
 */
export function themeClasses(theme: AppTheme): string[] {
	return theme === "high-contrast" ? ["dark", "high-contrast"] : [theme];
}

/** A theme synced from a newer app version that this build doesn't know falls back to dark. */
export function storedThemeFor(raw: string | undefined): AppTheme {
	return isAppTheme(raw) ? raw : "dark";
}

function readCachedEinkMode(): boolean {
	try {
		return localStorage.getItem(EINK_CACHE_KEY) === "1";
	} catch {
		return false;
	}
}

function applyAppearance(theme: AppTheme, appFontSize: number, isEinkMode: boolean) {
	// Apply to both: <html> so shadcn portals inherit, <body> so legacy Ionic
	// CSS (monochrome.css uses `body.dark` selectors) still fires during the
	// migration. Drop the body class once Ionic is fully removed.
	for (const el of [document.documentElement, document.body]) {
		el.classList.remove(...READER_THEMES);
		el.classList.add(...themeClasses(theme));
		el.classList.toggle(EINK_CLASS, isEinkMode);
	}
	document.documentElement.style.fontSize = `${appFontSize}px`;
	// Cache so index.html's inline script can apply synchronously on next load,
	// avoiding a flash of unstyled background before the DB hydrates.
	try {
		localStorage.setItem(THEME_CACHE_KEY, theme);
		localStorage.setItem(EINK_CACHE_KEY, isEinkMode ? "1" : "0");
	} catch {}
}

interface ThemeContextValue {
	/** The theme in effect: `light` while e-ink mode overrides the stored one. */
	theme: AppTheme;
	/** What the user picked. E-ink mode never changes it, since it syncs to other devices. */
	storedTheme: AppTheme;
	isEinkMode: boolean;
	setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const { data: settings } = queryHooks.useSettings();
	const saveMutation = queryHooks.useSaveSettings();

	const storedTheme = storedThemeFor(settings?.readerTheme);
	// Until settings load, trust what index.html already painted from the cache.
	const isEinkMode = settings ? settings.einkMode : readCachedEinkMode();
	const isLoaded = settings !== undefined;
	const theme: AppTheme = isEinkMode ? "light" : storedTheme;
	const appFontSize = settings?.appFontSize ?? DEFAULT_SETTINGS.APP_FONT_SIZE;

	const rawTheme = settings?.readerTheme;
	const setTheme = useCallback(
		(t: AppTheme) => {
			if (t !== rawTheme) saveMutation.mutate({ readerTheme: t });
		},
		[saveMutation, rawTheme],
	);

	// Only once settings have loaded: applying the defaults first would strip
	// the cached classes and flash a dark frame, a full panel refresh on e-ink.
	useEffect(() => {
		if (!isLoaded) return;
		applyAppearance(theme, appFontSize, isEinkMode);
	}, [isLoaded, theme, appFontSize, isEinkMode]);

	useEffect(() => {
		if (!isLoaded || !Capacitor.isNativePlatform()) return;
		// Style.Dark is light icons, for a dark page under the overlaid status bar.
		StatusBar.setStyle({ style: isDarkTheme(theme) ? Style.Dark : Style.Light }).catch((err) =>
			log.warn("theme", "status bar style failed:", err),
		);
	}, [isLoaded, theme]);

	return (
		<ThemeContext.Provider value={{ theme, storedTheme, isEinkMode, setTheme }}>
			{/* CSS cannot reach framer-motion; this makes every motion component jump to its end state. */}
			<MotionConfig skipAnimations={isEinkMode} reducedMotion={isEinkMode ? "always" : "user"}>
				{children}
			</MotionConfig>
		</ThemeContext.Provider>
	);
};

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
	return ctx;
}
