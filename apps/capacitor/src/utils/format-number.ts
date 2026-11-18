export { formatCount } from "@lesefluss/ui/format-count";

/**
 * The app's one compact count: "640", "12.5k", "150k", "1.2M", "10M". One decimal below 100k
 * and 10M; rounds down, so a count never shows a milestone it has not reached.
 */
export function formatCompactCount(n: number): string {
	if (n >= 1_000_000) return scaled(n / 1_000_000, n < 10_000_000 ? 1 : 0, "M");
	if (n >= 1000) return scaled(n / 1000, n < 100_000 ? 1 : 0, "k");
	return String(Math.round(n));
}

function scaled(value: number, decimals: number, unit: string): string {
	const step = 10 ** decimals;
	return `${Math.floor(value * step) / step}${unit}`;
}
