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

/**
 * Strip surrounding punctuation/symbols from a glossary label. A long-press
 * selection on "pause." should yield the entry label "pause", and quoted
 * selections like `"Harmony"` should yield `Harmony`. Internal characters
 * (spaces, hyphens, apostrophes inside the term) are preserved.
 */
export function normalizeGlossaryLabel(s: string): string {
	return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
}
