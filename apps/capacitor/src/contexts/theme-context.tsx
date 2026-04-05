import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type AppTheme = "dark" | "light";

const THEME_KEY = "reader_theme"; // reuse existing key so user preference carries over
const VALID_THEMES: AppTheme[] = ["dark", "light"];

function loadTheme(): AppTheme {
	const v = localStorage.getItem(THEME_KEY);
	return (VALID_THEMES as string[]).includes(v ?? "") ? (v as AppTheme) : "dark";
}

function applyTheme(theme: AppTheme) {
	if (theme === "dark") {
		document.body.classList.add("dark");
		document.body.classList.remove("light");
	} else {
		document.body.classList.add("light");
		document.body.classList.remove("dark");
	}
}

interface ThemeContextValue {
	theme: AppTheme;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [theme, setTheme] = useState<AppTheme>(() => {
		const initial = loadTheme();
		applyTheme(initial); // apply immediately, before first render
		return initial;
	});

	const toggleTheme = useCallback(() => {
		setTheme((prev) => {
			const next: AppTheme = prev === "dark" ? "light" : "dark";
			localStorage.setItem(THEME_KEY, next);
			applyTheme(next);
			return next;
		});
	}, []);

	// Keep body class in sync if theme changes externally (e.g. hot reload)
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
	return ctx;
}
