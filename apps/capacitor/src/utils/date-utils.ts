/**
 * Local-timezone date helpers used by stats (streaks, heatmaps, hour buckets).
 * All inputs are epoch ms; "local" means the device's current timezone.
 */

import { dayNumberOf } from "@lesefluss/core";

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

/** The app's one duration format: "0 min", "30 min", "1h", "4h 12m". Floors to whole minutes. */
export function formatDuration(ms: number): string {
	const min = Math.max(0, Math.floor(ms / 60_000));
	if (min < 60) return `${min} min`;
	const h = Math.floor(min / 60);
	const r = min % 60;
	return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATE_WITH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

/** The app's one calendar date format: "Aug 25", with the year when it is not the current one. */
export function formatDate(epochMs: number, now: number = Date.now()): string {
	// Intl's format throws on an invalid time; one bad timestamp must not take down the page.
	if (!Number.isFinite(epochMs)) return "";
	const sameYear = new Date(epochMs).getFullYear() === new Date(now).getFullYear();
	return (sameYear ? DATE_FORMAT : DATE_WITH_YEAR_FORMAT).format(epochMs);
}

/** Coarse relative timestamp: "today", "yesterday", "5d ago", "3w ago", then `formatDate` past 60 days. */
export function formatRelative(epochMs: number, now: number = Date.now()): string {
	const days = daysBetweenLocal(epochMs, now);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 60) return `${Math.floor(days / 7)}w ago`;
	return formatDate(epochMs, now);
}

/** Finer than `formatRelative` for the last day: "just now", "5 min ago", "3 h ago". */
export function formatAgo(epochMs: number, now: number = Date.now()): string {
	const diff = now - epochMs;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
	return formatRelative(epochMs, now);
}

/** The local `Date` at the given time on a `YYYY-MM-DD` day, or null for anything but a real date. */
export function localDateOfKey(key: string, hours = 0, minutes = 0, seconds = 0): Date | null {
	if (dayNumberOf(key) === null) return null;
	const [y, m, d] = key.split("-").map(Number);
	return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hours, minutes, seconds);
}

/** `formatDate` for a `YYYY-MM-DD` key. */
export function formatDayKey(key: string, now: number = Date.now()): string {
	const date = localDateOfKey(key);
	return date ? formatDate(date.getTime(), now) : key;
}
