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

/** An image reference found in the body. `src` is as written in the markup. */
type ImageRef = { src: string; alt: string };

/**
 * An image anchored to a position in the extracted text. `charOffset` is the
 * start of the first text that follows the image (`content.length` when none
 * does); the image itself contributes no characters.
 */
export type ContentImage = ImageRef & { charOffset: number };

/** A block of extracted text plus any links and images it contains. Image
 *  blocks have empty `text`. */
type Block = { text: string; links: ContentLink[]; images: ImageRef[] };

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

/** An `<img>` or SVG `<image>` with a usable source, or null for anything else. */
function imageRefOf(el: Element): ImageRef | null {
	const tag = el.tagName.toUpperCase();
	const src =
		tag === "IMG"
			? el.getAttribute("src")
			: tag === "IMAGE"
				? (el.getAttribute("href") ?? el.getAttribute("xlink:href"))
				: null;
	const trimmed = src?.trim();
	if (!trimmed) return null;
	return { src: trimmed, alt: (el.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim() };
}

/** Every `<img>` / SVG `<image>` inside `el` (including `el` itself), in document order. */
function collectImages(el: Element): ImageRef[] {
	const out: ImageRef[] = [];
	function walk(node: Node) {
		if (node.nodeType !== ELEMENT_NODE) return;
		const ref = imageRefOf(node as Element);
		if (ref) out.push(ref);
		for (const child of Array.from(node.childNodes)) walk(child);
	}
	walk(el);
	return out;
}

/**
 * Concatenate a node's descendant text (equivalent to `textContent`) while
 * recording the raw character ranges of external `<a href>` links and any
 * images met on the way. Nested links are ignored (outermost wins), matching
 * HTML's flat link model.
 */
function collectRawTextAndLinks(el: Element): {
	raw: string;
	links: { href: string; rawStart: number; rawEnd: number }[];
	images: ImageRef[];
} {
	let raw = "";
	const links: { href: string; rawStart: number; rawEnd: number }[] = [];
	const images: ImageRef[] = [];

	function walk(node: Node, insideLink: boolean) {
		if (node.nodeType === TEXT_NODE) {
			raw += node.textContent || "";
			return;
		}
		if (node.nodeType !== ELEMENT_NODE) return;
		const element = node as Element;
		const ref = imageRefOf(element);
		if (ref) images.push(ref);
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
	return { raw, links, images };
}

/** Normalize a leaf block's text and translate its link ranges into the
 *  normalized coordinate space. */
function extractLeafBlock(el: Element): Block {
	const { raw, links, images } = collectRawTextAndLinks(el);
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
	return { text, links: blockLinks, images };
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
	let firstImageBlock = -1;

	for (const child of Array.from(el.children)) {
		const tag = child.tagName.toUpperCase();

		if (HEADING_TAGS.has(tag)) {
			foundBlock = true;
			const text = extractHeadingText(child);
			const images = collectImages(child);
			if (text) blocks.push({ text: HEADING_PREFIX[tag] + text, links: [], images });
			else if (images.length) blocks.push({ text: "", links: [], images });
		} else if (LEAF_BLOCK_TAGS.has(tag)) {
			foundBlock = true;
			const block = extractLeafBlock(child);
			if (block.text || block.images.length) blocks.push(block);
		} else if (CONTAINER_TAGS.has(tag)) {
			foundBlock = true;
			blocks.push(...collectBlocks(child));
		} else {
			// Anything else (a bare image, or an inline wrapper such as Gutenberg's
			// `<a><img/></a>`) contributes only its images. Not counted as
			// `foundBlock`: a wrapper holding an image and loose text must still
			// fall through to the textContent path below, exactly as it did before
			// images were captured, or `content` would change for existing books.
			const images = collectImages(child);
			if (images.length) {
				if (firstImageBlock < 0) firstImageBlock = blocks.length;
				blocks.push({ text: "", links: [], images });
			}
		}
	}

	if (!foundBlock) {
		const text = (el.textContent || "").replace(/\s+/g, " ").trim();
		if (text) {
			const block: Block = { text, links: [], images: [] };
			// The wrapper's loose text is one block wherever it sits, so place it
			// by where it starts: text before the first image keeps the image
			// anchored to what follows the wrapper.
			if (firstImageBlock >= 0 && hasTextBeforeFirstImage(el)) {
				blocks.splice(firstImageBlock, 0, block);
			} else {
				blocks.push(block);
			}
		}
	}

	return blocks;
}

/** Whether non-blank text comes before the first image in document order. */
function hasTextBeforeFirstImage(el: Element): boolean {
	return firstTextOrImage(el) === "text";
}

function firstTextOrImage(node: Node): "text" | "image" | null {
	if (node.nodeType === TEXT_NODE) return (node.textContent || "").trim() ? "text" : null;
	if (node.nodeType !== ELEMENT_NODE) return null;
	if (imageRefOf(node as Element)) return "image";
	for (const child of Array.from(node.childNodes)) {
		const found = firstTextOrImage(child);
		if (found) return found;
	}
	return null;
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
	images: ContentImage[];
} {
	const allBlocks = collectBlocks(body);
	const blocks = allBlocks.filter((b) => b.text.length > 0);
	if (blocks.length === 0) {
		return {
			content: (body.textContent || "").replace(/\s+/g, " ").trim(),
			links: [],
			images: anchorImages(allBlocks, () => 0),
		};
	}

	const links: ContentLink[] = [];
	const blockStart = new Map<Block, number>();
	let offset = 0;
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) offset += 2; // the "\n\n" separator
		const block = blocks[i];
		blockStart.set(block, offset);
		for (const link of block.links) {
			links.push({
				href: link.href,
				startChar: offset + link.startChar,
				endChar: offset + link.endChar,
			});
		}
		offset += block.text.length;
	}
	const contentLength = offset;

	// An image anchors to the start of the next block that has text; a text
	// block's own images anchor to its start; trailing images to the end.
	let nextTextStart = contentLength;
	const startAfter = new Map<Block, number>();
	for (let i = allBlocks.length - 1; i >= 0; i--) {
		const block = allBlocks[i];
		const own = blockStart.get(block);
		if (own !== undefined) nextTextStart = own;
		startAfter.set(block, nextTextStart);
	}

	return {
		content: blocks.map((b) => b.text).join("\n\n"),
		links,
		images: anchorImages(allBlocks, (b) => startAfter.get(b) ?? contentLength),
	};
}

/** Flatten block images into anchored images, collapsing an image repeated at
 *  the same anchor (Kindle emits every image twice, once per render target). */
function anchorImages(blocks: Block[], anchorOf: (b: Block) => number): ContentImage[] {
	const out: ContentImage[] = [];
	for (const block of blocks) {
		const charOffset = anchorOf(block);
		for (const img of block.images) {
			const last = out[out.length - 1];
			if (last && last.src === img.src && last.charOffset === charOffset) continue;
			out.push({ ...img, charOffset });
		}
	}
	return out;
}

/** Plain-text-only view of {@link extractParagraphsWithLinks}. */
export function extractParagraphs(body: Element): string {
	return extractParagraphsWithLinks(body).content;
}
