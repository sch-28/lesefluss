import { type AppTheme, isDarkTheme } from "../../../contexts/theme-context";

// Loosely typed because @nivo/theming is a transitive dep we don't own. Every
// chart accepts `theme?: PartialTheme`, which is structurally compatible.
type PartialTheme = Record<string, unknown>;

/**
 * Reads palette from the live `document.body` so charts inherit the same CSS
 * variables that drive the rest of the app. Re-derive whenever the theme
 * class changes (callers pass `appTheme` as a key).
 */
export function buildNivoTheme(appTheme: AppTheme): PartialTheme {
	const styles = getComputedStyle(document.body);
	const text = styles.getPropertyValue("--foreground").trim() || "currentColor";
	const muted = styles.getPropertyValue("--muted-foreground").trim() || "currentColor";
	const border = styles.getPropertyValue("--border").trim() || "currentColor";
	const card = styles.getPropertyValue("--popover").trim() || "Canvas";

	return {
		background: "transparent",
		text: { fontSize: 11, fill: text, outlineWidth: 0, outlineColor: "transparent" },
		axis: {
			domain: { line: { stroke: border, strokeWidth: 1 } },
			legend: { text: { fontSize: 12, fill: muted } },
			ticks: {
				line: { stroke: border, strokeWidth: 1 },
				text: { fontSize: 11, fill: muted },
			},
		},
		grid: {
			line: { stroke: border, strokeOpacity: isDarkTheme(appTheme) ? 0.3 : 0.5, strokeWidth: 1 },
		},
		legends: { text: { fontSize: 12, fill: text } },
		tooltip: {
			container: {
				background: card,
				color: text,
				fontSize: 12,
				borderRadius: 8,
				boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
				padding: "6px 10px",
			},
		},
		labels: { text: { fontSize: 11, fill: text } },
		annotations: {
			text: { fontSize: 11, fill: text },
			link: { stroke: text, strokeWidth: 1 },
			outline: { stroke: text, strokeWidth: 2 },
			symbol: { fill: text },
		},
		dots: { text: { fontSize: 11, fill: text } },
		crosshair: { line: { stroke: muted, strokeWidth: 1, strokeOpacity: 0.6 } },
	};
}

/** A theme colour token's live value, for chart props that take a colour rather than a class. */
export function themeColor(token: `--${string}`): string {
	return getComputedStyle(document.body).getPropertyValue(token).trim() || "currentColor";
}
