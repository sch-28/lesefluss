/**
 * The reader's one polite live region. Announcements go here rather than into
 * live regions next to the text: Android collapses a paragraph into a single
 * screen-reader node only when every child is plain text, so a status element
 * inside a paragraph made TalkBack read it word by word again.
 */
let region: HTMLElement | null = null;

export function ReaderAnnouncer() {
	return (
		<span
			ref={(el) => {
				region = el;
			}}
			role="status"
			aria-live="polite"
			className="sr-only"
		/>
	);
}

/** Says `text` through the reader's live region, if one is mounted. */
export function announce(text: string): void {
	if (!region) return;
	// Cleared first, so the same message twice is still a change to announce.
	region.textContent = "";
	region.textContent = text;
}
