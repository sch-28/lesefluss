/**
 * Axis helpers shared by the stats charts. Both plot an index-based x scale
 * where every point is a bucket, so tick placement and labelling are the same
 * problem in both places.
 */

/**
 * Indices of at most `maxTicks` evenly spaced points, always including the
 * first and last. Labelling every bucket collides on a phone-width axis.
 */
export function evenTickIndices(count: number, maxTicks: number): number[] {
	if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
	const step = (count - 1) / (maxTicks - 1);
	return Array.from({ length: maxTicks }, (_, i) => Math.round(i * step));
}

export function formatDayTick(epochMs: number): string {
	return new Date(epochMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
