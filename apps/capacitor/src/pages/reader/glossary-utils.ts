/** 8-byte hex id generator for glossary entries (parallels the book id format). */
export function generateGlossaryId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(8)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Escape regex metacharacters in a label. */
export function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
