import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { EINK_CLASS } from "@lesefluss/ui/use-prefers-reduced-motion";
import { MotionConfig } from "framer-motion";
import type React from "react";
import { createContext, useCallback, useContext, useEffect } from "react";
import { queryHooks } from "../services/db/hooks";

export type AppTheme = "dark" | "sepia" | "light";

const VALID_THEMES: AppTheme[] = ["dark", "sepia", "light"];
const THEME_CACHE_KEY = "app-theme";
const EINK_CACHE_KEY = "app-eink";

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
		el.classList.remove(...VALID_THEMES);
		el.classList.add(theme);
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

	const rawTheme = settings?.readerTheme;
	const storedTheme: AppTheme =
		rawTheme && (VALID_THEMES as string[]).includes(rawTheme) ? (rawTheme as AppTheme) : "dark";
	// Until settings load, trust what index.html already painted from the cache.
	const isEinkMode = settings ? settings.einkMode : readCachedEinkMode();
	const isLoaded = settings !== undefined;
	const theme: AppTheme = isEinkMode ? "light" : storedTheme;
	const appFontSize = settings?.appFontSize ?? DEFAULT_SETTINGS.APP_FONT_SIZE;

	const setTheme = useCallback(
		(t: AppTheme) => {
			saveMutation.mutate({ readerTheme: t });
		},
		[saveMutation],
	);

	// Only once settings have loaded: applying the defaults first would strip
	// the cached classes and flash a dark frame, a full panel refresh on e-ink.
	useEffect(() => {
		if (!isLoaded) return;
		applyAppearance(theme, appFontSize, isEinkMode);
	}, [isLoaded, theme, appFontSize, isEinkMode]);

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
