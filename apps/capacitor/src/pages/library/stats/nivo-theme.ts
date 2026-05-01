import type { AppTheme } from "../../../contexts/theme-context";

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
	const text = styles.getPropertyValue("--ion-text-color").trim() || "#000";
	const muted = styles.getPropertyValue("--ion-color-medium").trim() || "#999";
	const border = styles.getPropertyValue("--ion-border-color").trim() || "#d9d9d9";
	const card = styles.getPropertyValue("--ion-card-background").trim() || "#fff";

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
			line: { stroke: border, strokeOpacity: appTheme === "dark" ? 0.3 : 0.5, strokeWidth: 1 },
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

/**
 * Accent gradient stops used across the page. We pick a single brand accent
 * (per theme) so the calendar / line / bar all stay in family even when the
 * cover-derived hero gradient changes per session.
 */
/** Brand orange (matches toast surface) plus a warmer gradient partner. */
export function getAccentStops(appTheme: AppTheme): { from: string; to: string } {
	switch (appTheme) {
		case "dark":
			return { from: "#c94b2a", to: "#f97316" };
		case "sepia":
			return { from: "#b45309", to: "#d97706" };
		default:
			return { from: "#c94b2a", to: "#ea580c" };
	}
}
