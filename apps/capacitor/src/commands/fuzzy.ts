const WORD_START = /[\s\-:/(]/;

/**
 * Scores `query` as a subsequence of `text`, case-insensitively; null when it
 * is not one. Consecutive letters, word starts and an early first match score higher.
 */
export function fuzzyScore(query: string, text: string): number | null {
	const q = query.trim().toLowerCase();
	if (q === "") return 0;
	const t = text.toLowerCase();
	let score = 0;
	let from = 0;
	let previous = -2;
	let firstAt = -1;
	for (const ch of q) {
		if (ch === " ") continue;
		const at = t.indexOf(ch, from);
		if (at === -1) return null;
		score += 1;
		if (at === previous + 1) score += 3;
		if (at === 0 || WORD_START.test(t[at - 1])) score += 4;
		if (firstAt === -1) firstAt = at;
		previous = at;
		from = at + 1;
	}
	if (t.startsWith(q)) score += 10;
	return score - firstAt * 0.1;
}

/** The best score over a command's title and keywords. */
export function bestScore(query: string, texts: readonly string[]): number | null {
	let best: number | null = null;
	for (const text of texts) {
		const score = fuzzyScore(query, text);
		if (score !== null && (best === null || score > best)) best = score;
	}
	return best;
}
