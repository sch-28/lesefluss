/**
 * Local-timezone date helpers used by stats (streaks, heatmaps, hour buckets).
 * All inputs are epoch ms; "local" means the device's current timezone.
 */

const MS_PER_DAY = 86_400_000;
const TWELVE_HOURS_MS = 12 * 3_600_000;

export function startOfLocalDay(epochMs: number): number {
	const d = new Date(epochMs);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export function daysBetweenLocal(a: number, b: number): number {
	return Math.round((startOfLocalDay(b) - startOfLocalDay(a)) / MS_PER_DAY);
}

export function localDateKey(epochMs: number): string {
	const d = new Date(epochMs);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/**
 * Step one local day backwards. Subtracting 12h then snapping to start-of-day
 * is robust to DST: the 1-hour shift never crosses a 12h gap.
 */
export function previousLocalDayStart(localDayStart: number): number {
	return startOfLocalDay(localDayStart - TWELVE_HOURS_MS);
}

/** "30m", "1h", "4h 12m". Zero or negative inputs render as "0m". */
export function formatDuration(ms: number): string {
	const min = Math.max(0, Math.floor(ms / 60_000));
	if (min < 60) return `${min}m`;
	const h = Math.floor(min / 60);
	const r = min % 60;
	return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/**
 * Coarse relative timestamp: "today", "yesterday", "5d ago", "3w ago",
 * falling back to an absolute "MMM D, YYYY" past 60 days.
 */
export function formatRelative(epochMs: number, now: number = Date.now()): string {
	const days = daysBetweenLocal(epochMs, now);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 60) return `${Math.floor(days / 7)}w ago`;
	const d = new Date(epochMs);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
