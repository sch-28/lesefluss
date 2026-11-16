/**
 * The app's one percent format. Whole percents round like `readingProgress`, so a
 * book's percent reads the same on every screen; goal amounts pass one decimal,
 * which drops a trailing ".0" ("3%", "2.7%").
 */
export function formatPercent(value: number, decimals: 0 | 1 = 0): string {
	const factor = 10 ** decimals;
	return `${Math.min(100, Math.max(0, Math.round(value * factor) / factor))}%`;
}
