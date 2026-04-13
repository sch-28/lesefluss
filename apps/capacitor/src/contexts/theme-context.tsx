import type React from "react";
import { createContext, useCallback, useContext, useEffect } from "react";
import { queryHooks } from "../services/db/hooks";

export type AppTheme = "dark" | "sepia" | "light";

const VALID_THEMES: AppTheme[] = ["dark", "sepia", "light"];

function applyTheme(theme: AppTheme) {
	document.body.classList.remove(...VALID_THEMES);
	document.body.classList.add(theme);
}

interface ThemeContextValue {
	theme: AppTheme;
	setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const { data: settings } = queryHooks.useSettings();
	const saveMutation = queryHooks.useSaveSettings();

	const rawTheme = settings?.readerTheme;
	const theme: AppTheme =
		rawTheme && (VALID_THEMES as string[]).includes(rawTheme) ? (rawTheme as AppTheme) : "dark";

	const setTheme = useCallback(
		(t: AppTheme) => {
			saveMutation.mutate({ readerTheme: t });
		},
		[saveMutation],
	);

	// Keep body class in sync with theme
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
	return ctx;
}
