export function formatReadingTime(minutes: number): string {
	if (minutes < 1) return "< 1 min";
	if (minutes < 60) return `${Math.round(minutes)} min`;
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
