import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { approximate, isLatin1Letter } from "./codepoint-fold.js";
import { MAX_EPUB_BYTES } from "./epub-limits.js";

/**
 * Word counts that match what the app shows after import.
 *
 * The app counts with `buildWordIndex` from @lesefluss/core, which mirrors the
 * rsvpnano firmware. Core ships TypeScript source and this service runs
 * compiled JS, so the codepoint folding is copied (`codepoint-fold.ts`) and
 * the boundary rules are reimplemented here; a test runs both on the same
 * samples. The remaining difference is text extraction: the app adds a
 * heading line per chapter on import, worth a word or two per chapter.
 */

const MAX_FILE_BYTES = MAX_EPUB_BYTES;

function isWordChar(c: string): boolean {
	const v = c.charCodeAt(0);
	return (
		(v >= 0x41 && v <= 0x5a) ||
		(v >= 0x61 && v <= 0x7a) ||
		(v >= 0x30 && v <= 0x39) ||
		isLatin1Letter(v)
	);
}

/** Number of entries core's tokenizer would produce for `text`. */
export function countWords(text: string): number {
	let normalized = "";
	for (const ch of text) normalized += approximate(ch.codePointAt(0) ?? 0);

	let count = 0;
	let current = "";

	// Core emits a standalone hyphen as an entry, appends a bare ellipsis to the
	// previous word, and drops tokens with no letter or digit.
	const finishToken = (token: string) => {
		if (/^-+$/.test(token) || [...token].some(isWordChar)) count++;
	};
	const flush = () => {
		finishToken(current);
		current = "";
	};

	const n = normalized.length;
	for (let i = 0; i < n; i++) {
		const c = normalized[i] as string;
		if (c.charCodeAt(0) <= 0x20) {
			flush();
			continue;
		}
		if (c === "-") {
			const prev = current[current.length - 1];
			const next = normalized[i + 1];
			if (prev && isWordChar(prev) && next && next !== "-" && isWordChar(next)) {
				current += c;
				continue;
			}
			flush();
			while (normalized[i + 1] === "-") i++;
			finishToken("-");
			continue;
		}
		if (c === "." && normalized[i + 1] === "." && normalized[i + 2] === ".") {
			current += "...";
			i += 2;
			while (normalized[i + 1] === ".") i++;
			flush();
			continue;
		}
		current += c;
	}
	flush();
	return count;
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	mdash: "—",
	ndash: "–",
	hellip: "…",
};

/** Visible text of an XHTML document, block boundaries kept as whitespace. */
export function xhtmlToText(xhtml: string): string {
	return xhtml
		.replace(/<head[\s\S]*?<\/head>/gi, " ")
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
			if (e[0] === "#") {
				const cp =
					e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
				return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : " ";
			}
			return ENTITIES[e.toLowerCase()] ?? m;
		});
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

type Attrs = Record<string, string | undefined>;
const asArray = <T>(v: T | T[] | undefined): T[] =>
	v === undefined ? [] : Array.isArray(v) ? v : [v];

function resolvePath(base: string, href: string): string {
	const parts = base.split("/").slice(0, -1);
	for (const seg of decodeURIComponent(href.split("#")[0] ?? "").split("/")) {
		if (seg === "..") parts.pop();
		else if (seg !== "." && seg !== "") parts.push(seg);
	}
	return parts.join("/");
}

/**
 * Words in an EPUB's reading order (OPF spine), or null when it cannot be
 * read: not a zip, a corrupt entry, a malformed href. Yields to the event loop
 * between documents, since counting a long book takes a few hundred ms of CPU.
 */
export async function countEpubWords(bytes: Uint8Array | ArrayBuffer): Promise<number | null> {
	if (bytes.byteLength > MAX_FILE_BYTES) return null;
	try {
		const zip = await JSZip.loadAsync(bytes);
		const container = await zip.file("META-INF/container.xml")?.async("string");
		if (!container) return null;
		const rootfiles = asArray<Attrs>(xml.parse(container)?.container?.rootfiles?.rootfile);
		const opfPath = rootfiles[0]?.["@_full-path"];
		const opfText = opfPath ? await zip.file(opfPath)?.async("string") : undefined;
		if (!opfPath || !opfText) return null;

		const pkg = xml.parse(opfText)?.package;
		const manifest = new Map<string, Attrs>(
			asArray<Attrs>(pkg?.manifest?.item).map((item) => [item["@_id"] ?? "", item]),
		);
		const spine = asArray<Attrs>(pkg?.spine?.itemref);

		let total = 0;
		for (const ref of spine) {
			const item = manifest.get(ref["@_idref"] ?? "");
			// Navigation documents are not part of the text the reader shows.
			if (!item?.["@_href"] || item["@_properties"]?.includes("nav")) continue;
			const doc = await zip.file(resolvePath(opfPath, item["@_href"]))?.async("string");
			if (doc) total += countWords(xhtmlToText(doc));
			await yieldToEventLoop();
		}
		return total > 0 ? total : null;
	} catch {
		return null;
	}
}
