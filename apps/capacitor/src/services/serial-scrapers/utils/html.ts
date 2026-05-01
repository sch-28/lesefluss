/**
 * Shared DOM helpers for serial scrapers. Re-exports `extractParagraphs` from
 * the shared book-import package for parity with HTML/EPUB parsing, plus
 * serial-specific helpers for stripping anti-piracy / hidden nodes.
 */
export { extractParagraphs } from "@lesefluss/book-import";

export function parseHtml(html: string): Document {
	return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Return trimmed text content of an element, or `null` if absent or empty.
 * Used by every provider adapter — centralised here so the pattern doesn't
 * drift between adapters.
 */
export function textOrNull(el: Element | null): string | null {
	const t = el?.textContent?.trim();
	return t && t.length > 0 ? t : null;
}

/**
 * Strip HTML tags from a fragment string and collapse whitespace. Used by
 * adapters that consume JSON APIs which embed raw HTML in text fields
 * (e.g. Wuxiaworld's `synopsis`). Parses through `DOMParser` rather than a
 * regex so entities (`&amp;`, `&#x2014;`, …) are decoded correctly.
 *
 * Returns `null` if the result is empty after trimming.
 */
export function stripTags(fragment: string | null | undefined): string | null {
	if (!fragment) return null;
	const text = parseHtml(fragment).body.textContent?.replace(/\s+/g, " ").trim();
	return text && text.length > 0 ? text : null;
}

// Anchor the value end with `(;|$)` (and optional trailing whitespace) so
// `display:none-on-scroll` doesn't false-positive — `\b` alone matches the
// `-` boundary.
const HIDDEN_DISPLAY = /(^|;)\s*display\s*:\s*none\s*(;|$)/i;
const HIDDEN_VISIBILITY = /(^|;)\s*visibility\s*:\s*hidden\s*(;|$)/i;

function isHidden(el: Element): boolean {
	if (el.hasAttribute("hidden")) return true;
	if (el.getAttribute("aria-hidden") === "true") return true;
	const style = el.getAttribute("style");
	if (!style) return false;
	return HIDDEN_DISPLAY.test(style) || HIDDEN_VISIBILITY.test(style);
}

/**
 * Remove visually hidden subtrees. Royal Road interleaves hidden anti-piracy
 * paragraphs into chapter content; AO3 and ScribbleHub don't need this, but
 * running it unconditionally is cheap and keeps adapters symmetric.
 *
 * Walks the tree once and removes nodes whose `style` attribute *parses* as
 * hidden — substring matches on `[style*="display:none"]` would false-positive
 * on hypothetical fragments like `display:none-on-scroll`.
 */
/**
 * Resolve a possibly-relative URL against `origin`.
 * If `href` already starts with a scheme, it is returned as-is.
 * Used by every provider adapter to normalise anchor hrefs to absolute form.
 */
export function absolutize(href: string, origin: string): string {
	return href.startsWith("http") ? href : `${origin}${href}`;
}

/**
 * Extract the JSON object assigned to `window.<name>` from a `<script>` body
 * embedded in an HTML page. Used by SPA-style providers (e.g. Wuxiaworld)
 * that render data into the page as a JS assignment rather than a JSON
 * `<script type="application/json">` tag.
 *
 * Walks `<script>` nodes for an assignment matching `window.{name} = {…}`,
 * then bracket-balances forward through the source (skipping string literals)
 * to find the matching closing brace. The resulting slice is `JSON.parse`-d.
 *
 * Returns `null` if the assignment is missing or the slice doesn't parse.
 * Returned as `unknown` — callers narrow with their own type guards.
 *
 * @param doc - parsed document (use `parseHtml` upstream)
 * @param name - the assigned identifier, e.g. `"__REACT_QUERY_STATE__"`
 */
export function extractScriptAssignment(doc: Document, name: string): unknown {
	const scripts = Array.from(doc.querySelectorAll("script"));
	const needle = `window.${name}`;
	const assignmentRe = new RegExp(`window\\.${name}\\s*=\\s*`);

	for (const script of scripts) {
		const src = script.textContent ?? "";
		if (!src.includes(needle)) continue;
		const match = assignmentRe.exec(src);
		if (!match) continue;

		const start = match.index + match[0].length;
		if (src[start] !== "{") continue;

		// Bracket-balance forward, skipping string literals (with escapes) so
		// any `{` / `}` inside strings doesn't confuse the depth counter.
		let depth = 0;
		let inStr = false;
		let esc = false;
		for (let i = start; i < src.length; i++) {
			const c = src[i];
			if (inStr) {
				if (esc) {
					esc = false;
					continue;
				}
				if (c === "\\") {
					esc = true;
					continue;
				}
				if (c === '"') inStr = false;
				continue;
			}
			if (c === '"') {
				inStr = true;
				continue;
			}
			if (c === "{") {
				depth++;
			} else if (c === "}") {
				depth--;
				if (depth === 0) {
					try {
						return JSON.parse(src.slice(start, i + 1));
					} catch {
						return null;
					}
				}
			}
		}
	}
	return null;
}

export function stripHidden(root: Element): void {
	// Snapshot first; querySelectorAll('*') is live-ish in some implementations
	// and we mutate during iteration.
	const all = Array.from(root.querySelectorAll("*"));
	for (const el of all) {
		if (isHidden(el)) el.remove();
	}
}
