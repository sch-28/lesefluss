/**
 * Build a `.rsvp` document body matching the rsvpnano firmware's expected
 * format. The Python reference implementation lives at
 * `apps/rsvpnano/tools/epub_to_rsvp.py`; this module is a TS port that runs
 * client-side so the capacitor app can upload any book in the lesefluss
 * library without round-tripping through the browser-based converter.
 *
 * Format summary:
 *   @rsvp 1
 *   @title <title>
 *   @author <author>           (optional)
 *   @source <source name>      (optional)
 *
 *   @chapter <chapter title>
 *   <chapter body, plain UTF-8 text, lines starting with literal `@`
 *    escaped to `@@`>
 *
 *   @chapter ...               (one block per chapter)
 *
 * When the book has no chapter metadata, a single synthetic chapter named
 * after the book is emitted to ensure the firmware always sees at least
 * one `@chapter` directive.
 */

const RSVP_VERSION = 1;

export type RsvpChapter = {
	title: string;
	startByte: number;
};

export type BuildRsvpDocumentInput = {
	title: string;
	author?: string | null;
	source?: string | null;
	body: string;
	/** Sorted ascending by startByte. Empty / undefined → single synthetic chapter. */
	chapters?: RsvpChapter[];
};

const TEXT_ENCODER = new TextEncoder();

function directiveText(value: string): string {
	// Single-line directive payloads: collapse newlines + tabs to single spaces.
	return value.replace(/[\r\n\t]+/g, " ").trim();
}

function escapeBody(text: string): string {
	// Per rsvpnano spec, body lines starting with literal `@` get an extra `@`
	// prefix so they aren't misread as directives. Apply per line, preserve
	// original newline positions otherwise. Match start-of-string OR after a
	// newline.
	return text.replace(/(^|\n)@/g, (_match, prefix) => `${prefix}@@`);
}

function sliceBody(body: string, start: number, end: number): string {
	// Slice + trim leading/trailing whitespace runs (body may have blank lines
	// at chapter boundaries that look ugly in the on-device reader).
	return body.slice(start, end).replace(/^\s+|\s+$/g, "");
}

export function buildRsvpDocument(input: BuildRsvpDocumentInput): Uint8Array {
	const lines: string[] = [];
	lines.push(`@rsvp ${RSVP_VERSION}`);
	const title = directiveText(input.title || "Untitled");
	lines.push(`@title ${title}`);
	const author = input.author ? directiveText(input.author) : "";
	if (author) {
		lines.push(`@author ${author}`);
	}
	const source = input.source ? directiveText(input.source) : "";
	if (source) {
		lines.push(`@source ${source}`);
	}
	lines.push("");

	const sorted = (input.chapters ?? [])
		.filter((c) => Number.isFinite(c.startByte) && c.startByte >= 0)
		.slice()
		.sort((a, b) => a.startByte - b.startByte);

	if (sorted.length === 0) {
		lines.push(`@chapter ${title}`);
		const escaped = escapeBody(input.body.replace(/^\s+|\s+$/g, ""));
		if (escaped) {
			lines.push(escaped);
		}
	} else {
		// Body before the first chapter (rare but possible: front matter) is
		// attached to the first chapter so the firmware always parses content
		// after each directive.
		for (let i = 0; i < sorted.length; i++) {
			const chapter = sorted[i];
			const sliceStart = i === 0 ? 0 : chapter.startByte;
			const sliceEnd = i + 1 < sorted.length ? sorted[i + 1].startByte : input.body.length;
			const chapterTitle = directiveText(chapter.title || `Chapter ${i + 1}`);
			lines.push(`@chapter ${chapterTitle}`);
			const slice = sliceBody(input.body, sliceStart, sliceEnd);
			if (slice) {
				lines.push(escapeBody(slice));
			}
			lines.push("");
		}
		// Drop trailing blank line from the last push("")
		if (lines[lines.length - 1] === "") {
			lines.pop();
		}
	}

	return TEXT_ENCODER.encode(`${lines.join("\n")}\n`);
}
