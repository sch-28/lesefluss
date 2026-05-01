/** Tags that are headings and should be prefixed with # markers. */
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

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
		if (node.nodeType === Node.TEXT_NODE) {
			const t = (node.textContent || "").replace(/\s+/g, " ").trim();
			if (t) parts.push(t);
		} else if (node.nodeType === Node.ELEMENT_NODE) {
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
 * Walk an element and collect all readable blocks as strings.
 * Returns a flat array of paragraph strings.
 */
function collectBlocks(el: Element): string[] {
	const blocks: string[] = [];
	let foundBlock = false;

	for (const child of Array.from(el.children)) {
		const tag = child.tagName.toUpperCase();

		if (HEADING_TAGS.has(tag)) {
			foundBlock = true;
			const text = extractHeadingText(child);
			if (text) blocks.push(HEADING_PREFIX[tag] + text);
		} else if (LEAF_BLOCK_TAGS.has(tag)) {
			foundBlock = true;
			const text = (child.textContent || "").replace(/\s+/g, " ").trim();
			if (text) blocks.push(text);
		} else if (CONTAINER_TAGS.has(tag)) {
			foundBlock = true;
			const nested = collectBlocks(child);
			blocks.push(...nested);
		}
	}

	if (!foundBlock) {
		const text = (el.textContent || "").replace(/\s+/g, " ").trim();
		if (text) blocks.push(text);
	}

	return blocks;
}

/**
 * Walk the direct children of a block-level element (typically `<body>`) and
 * produce a paragraph-aware plain-text string where each block-level element
 * becomes its own paragraph, joined with `\n\n`.
 *
 * Headings (H1–H6) are prefixed with markdown-style `#` markers so the reader
 * can detect and style them with larger text.
 */
export function extractParagraphs(body: Element): string {
	const blocks = collectBlocks(body);
	return blocks.length > 0
		? blocks.join("\n\n")
		: (body.textContent || "").replace(/\s+/g, " ").trim();
}
