/**
 * Catalog subjects are library headings ("Villages -- France -- Fiction",
 * "Fiction, Historical"). Split into their parts and deduplicated, they read as
 * tags, and "Fiction" on five headings shows once.
 */
export function readableSubjects(subjects: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const subject of subjects) {
		for (const part of subject.split(/\s*--\s*/)) {
			const tag = part.trim();
			const key = tag.toLowerCase();
			if (!tag || seen.has(key)) continue;
			seen.add(key);
			out.push(tag);
		}
	}
	return out;
}
