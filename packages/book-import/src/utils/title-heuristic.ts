const MAX_TITLE_LENGTH = 80;

/**
 * The first non-empty line, when it is short enough to read as a title
 * (≤80 chars). Null when the text opens with prose.
 *
 * Split out from `deriveTitle` because the timestamp below is not reproducible:
 * anything that needs to derive the same title twice (a scan previewing a file,
 * then importing it minutes later) must be able to stop before it.
 */
export function firstTitleLikeLine(text: string): string | null {
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		return line.length <= MAX_TITLE_LENGTH ? line : null;
	}
	return null;
}

/**
 * Derive a book title from free-form text. Returns the first non-empty line
 * if it looks title-like (≤80 chars). Longer first lines are treated as
 * prose and a local-time timestamped fallback is used instead.
 */
export function deriveTitle(text: string, fallbackPrefix = "Pasted text"): string {
	const line = firstTitleLikeLine(text);
	if (line) return line;
	const stamp = new Date().toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${fallbackPrefix} · ${stamp}`;
}
