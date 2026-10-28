const UNITS = ["KB", "MB", "GB", "TB"];

/**
 * Binary units with one decimal. The unit is chosen after rounding, so a value
 * that would display as "1024.0 MB" reads "1.0 GB" instead.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
	let value = bytes / 1024;
	let unit = 0;
	while (unit < UNITS.length - 1 && Number(value.toFixed(1)) >= 1024) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${UNITS[unit]}`;
}
