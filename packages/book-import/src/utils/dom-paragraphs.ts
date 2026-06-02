/** Tags that are headings and should be prefixed with # markers. */
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Heading tags mapped to their markdown-style # prefix depth. */
const HEADING_PREFIX: Record<string, string> = {
	H1: "# ",
	H2: "## ",
	H3: "### ",
	H4: "#### ",
	H5: "##### ",
	H6: "###### ",
};

/** Tags that are direct block containers - we recurse into them for nested blocks. */
const CONTAINER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "UL", "OL"]);

/** Tags that are leaf block elements - we extract their text directly. */
const LEAF_BLOCK_TAGS = new Set(["P", "LI"]);

/** A hyperlink captured within extracted text, offset into that text. */
export type ContentLink = { href: string; startChar: number; endChar: number };

/** A block of extracted text plus any links it contains (block-local offsets). */
type Block = { text: string; links: ContentLink[] };

/** Only external http/https links are captured; anchors / relative / dangerous
 *  schemes (`#`, `chapter.xhtml`, `javascript:`, `data:`) are dropped. */
function isExternalHref(href: string): boolean {
	return /^https?:\/\//i.test(href.trim());
}

/**
 * Collapse runs of whitespace to a single space (the same transform as
 * `text.replace(/\s+/g, " ").trim()`), and return a map from each raw character
 * index to its index in the collapsed (pre-trim) string, so link offsets
 * recorded against the raw text can be translated into the normalized text that
 * becomes book `content`. Index `raw.length` maps to the collapsed length.
 */
function collapseWithMap(raw: string): { collapsed: string; map: number[] } {
	const map = new Array<number>(raw.length + 1);
	let out = "";
	let prevSpace = false;
	for (let i = 0; i < raw.length; i++) {
		map[i] = out.length;
		if (/\s/.test(raw[i])) {
			if (!prevSpace && out.length > 0) {
				out += " ";
				prevSpace = true;
			}
		} else {
			out += raw[i];
			prevSpace = false;
		}
	}
	map[raw.length] = out.length;
	return { collapsed: out, map };
}

/**
 * Concatenate a node's descendant text (equivalent to `textContent`) while
 * recording the raw character ranges of external `<a href>` links. Nested links
 * are ignored (outermost wins), matching HTML's flat link model.
 */
function collectRawTextAndLinks(el: Element): {
	raw: string;
	links: { href: string; rawStart: number; rawEnd: number }[];
} {
	let raw = "";
	const links: { href: string; rawStart: number; rawEnd: number }[] = [];

	function walk(node: Node, insideLink: boolean) {
		if (node.nodeType === TEXT_NODE) {
			raw += node.textContent || "";
			return;
		}
		if (node.nodeType !== ELEMENT_NODE) return;
		const element = node as Element;
		if (!insideLink && element.tagName.toUpperCase() === "A") {
			const href = element.getAttribute("href") ?? "";
			if (isExternalHref(href)) {
				const rawStart = raw.length;
				for (const child of Array.from(node.childNodes)) walk(child, true);
				if (raw.length > rawStart) {
					links.push({ href: href.trim(), rawStart, rawEnd: raw.length });
				}
				return;
			}
		}
		for (const child of Array.from(node.childNodes)) walk(child, insideLink);
	}

	for (const child of Array.from(el.childNodes)) walk(child, false);
	return { raw, links };
}

/** Normalize a leaf block's text and translate its link ranges into the
 *  normalized coordinate space. */
function extractLeafBlock(el: Element): Block {
	const { raw, links } = collectRawTextAndLinks(el);
	const { collapsed, map } = collapseWithMap(raw);
	const text = collapsed.replace(/ $/, "");
	const blockLinks: ContentLink[] = [];
	for (const link of links) {
		let startChar = map[link.rawStart];
		let endChar = Math.min(map[link.rawEnd], text.length);
		// The raw range can include whitespace inside the <a> that collapsed to a
		// space; clamp to the visible text so the range covers only the link words.
		while (startChar < endChar && text[startChar] === " ") startChar++;
		while (endChar > startChar && text[endChar - 1] === " ") endChar--;
		if (endChar > startChar) blockLinks.push({ href: link.href, startChar, endChar });
	}
	return { text, links: blockLinks };
}

/**
 * Collect text content from a heading element robustly.
 *
 * Many EPUBs structure headings like:
 *   <h1>1<br/><span>Chapter Title</span></h1>
 *
 * Calling textContent collapses this to "1 Chapter Title".
 * Instead we walk childNodes and:
 *   - Skip <br> elements entirely
 *   - Collect text from all other nodes (text nodes + inline elements)
 *   - Join with a space, then normalise whitespace
 */
function extractHeadingText(el: Element): string {
	const parts: string[] = [];

	function walk(node: Node) {
		if (node.nodeType === TEXT_NODE) {
			const t = (node.textContent || "").replace(/\s+/g, " ").trim();
			if (t) parts.push(t);
		} else if (node.nodeType === ELEMENT_NODE) {
			const tag = (node as Element).tagName.toUpperCase();
			if (tag === "BR") return;
			for (const child of Array.from(node.childNodes)) walk(child);
		}
	}

	for (const child of Array.from(el.childNodes)) walk(child);

	// Some EPUBs prepend a bare chapter number (e.g. "1") before the title span.
	if (parts.length > 1 && /^\d+$/.test(parts[0])) {
		parts.shift();
	}

	return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Walk an element and collect all readable blocks. Returns a flat array of
 * blocks, each with its normalized text and any external links it contains
 * (offsets are relative to the block's own text).
 *
 * Links are captured from leaf blocks (P, LI) only. Heading link capture is
 * intentionally skipped: extractHeadingText reshapes the text (drops a leading
 * chapter number, joins inline parts with spaces), which would desync offsets,
 * and links in headings are vanishingly rare.
 */
function collectBlocks(el: Element): Block[] {
	const blocks: Block[] = [];
	let foundBlock = false;

	for (const child of Array.from(el.children)) {
		const tag = child.tagName.toUpperCase();

		if (HEADING_TAGS.has(tag)) {
			foundBlock = true;
			const text = extractHeadingText(child);
			if (text) blocks.push({ text: HEADING_PREFIX[tag] + text, links: [] });
		} else if (LEAF_BLOCK_TAGS.has(tag)) {
			foundBlock = true;
			const block = extractLeafBlock(child);
			if (block.text) blocks.push(block);
		} else if (CONTAINER_TAGS.has(tag)) {
			foundBlock = true;
			blocks.push(...collectBlocks(child));
		}
	}

	if (!foundBlock) {
		const text = (el.textContent || "").replace(/\s+/g, " ").trim();
		if (text) blocks.push({ text, links: [] });
	}

	return blocks;
}

/**
 * Walk the direct children of a block-level element (typically `<body>`) and
 * produce a paragraph-aware plain-text string where each block-level element
 * becomes its own paragraph, joined with `\n\n`, alongside the external links
 * found within, anchored to character offsets in that returned string.
 *
 * Headings (H1–H6) are prefixed with markdown-style `#` markers so the reader
 * can detect and style them with larger text.
 */
export function extractParagraphsWithLinks(body: Element): {
	content: string;
	links: ContentLink[];
} {
	const blocks = collectBlocks(body);
	if (blocks.length === 0) {
		return { content: (body.textContent || "").replace(/\s+/g, " ").trim(), links: [] };
	}

	const links: ContentLink[] = [];
	let offset = 0;
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) offset += 2; // the "\n\n" separator
		const block = blocks[i];
		for (const link of block.links) {
			links.push({
				href: link.href,
				startChar: offset + link.startChar,
				endChar: offset + link.endChar,
			});
		}
		offset += block.text.length;
	}

	return { content: blocks.map((b) => b.text).join("\n\n"), links };
}

/** Plain-text-only view of {@link extractParagraphsWithLinks}. */
export function extractParagraphs(body: Element): string {
	return extractParagraphsWithLinks(body).content;
}
