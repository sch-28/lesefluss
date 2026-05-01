const MAX_TITLE_LENGTH = 80;

/**
 * Derive a book title from free-form text. Returns the first non-empty line
 * if it looks title-like (≤80 chars). Longer first lines are treated as
 * prose and a local-time timestamped fallback is used instead.
 */
export function deriveTitle(text: string, fallbackPrefix = "Pasted text"): string {
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.length <= MAX_TITLE_LENGTH) return line;
		break;
	}
	const stamp = new Date().toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${fallbackPrefix} · ${stamp}`;
}
