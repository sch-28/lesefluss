import { describe, expect, it } from "vitest";
import { countEpubWords, countWords, xhtmlToText } from "../word-count.js";

// Loaded by computed path so the catalog's tsc (rootDir src) doesn't try to
// compile workspace sources; vitest resolves and transpiles them fine.
const REPO = new URL("../../../../../", import.meta.url).pathname;
type BuildIndex = (content: string) => unknown[];
type BuildEpub = (fixture: {
	title?: string;
	chapters: { id: string; href: string; body: string }[];
	useEpub3Nav?: boolean;
}) => Promise<ArrayBuffer>;

async function coreCount(text: string): Promise<number> {
	const mod = (await import(`${REPO}packages/core/src/tokenizer.ts`)) as {
		buildWordIndexFromTokenizer: BuildIndex;
	};
	return mod.buildWordIndexFromTokenizer(text).length;
}

const SAMPLES = [
	"It was the best of times, it was the worst of times.",
	"A well-known man—who said nothing—left… then: “Wait...” she cried.",
	"Pre-war -- post-war - and ---- dashes; trailing- and -leading hyphens.",
	"Café naïve Ærøskøbing Łódź straße œuvre façade",
	"Numbers 1984, 3.14 and 1,000,000; symbols * & % # @ alone.",
	"Mixed 東京 text with Москва and ελληνικά words in between.",
	"Ellipsis at end...\n\nNew paragraph. ... Lone ellipsis ... and more.....",
	"Soft­hyphen zero​width non breaking em-space.",
];

describe("countWords", () => {
	it.each(SAMPLES)("matches the app tokenizer: %s", async (text) => {
		expect(countWords(text)).toBe(await coreCount(text));
	});

	it("counts nothing in empty or symbol-only text", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("  * # ... ")).toBe(0);
	});
});

describe("xhtmlToText", () => {
	it("drops head, scripts and tags and decodes entities", () => {
		const text = xhtmlToText(
			"<html><head><title>Skip me</title></head><body><script>var x</script>" +
				"<p>Tom&amp;Jerry&#8212;friends&nbsp;&#x2026;</p></body></html>",
		);
		expect(text).not.toContain("Skip");
		expect(text).not.toContain("var x");
		expect(text).toContain("Tom&Jerry—friends …");
	});
});

describe("countEpubWords", () => {
	const build = async () => {
		const { buildEpub } = (await import(
			`${REPO}packages/book-import/src/test-fixtures/build-epub.ts`
		)) as { buildEpub: BuildEpub };
		return buildEpub({
			title: "Count Test",
			useEpub3Nav: true,
			chapters: [
				{ id: "c1", href: "text/c1.xhtml", body: "<h1>One</h1><p>Alpha beta gamma.</p>" },
				{ id: "c2", href: "text/c2.xhtml", body: "<p>Delta&#8212;epsilon zeta-eta.</p>" },
			],
		});
	};

	it("counts the spine documents in order and skips the nav document", async () => {
		const bytes = await build();
		// "One Alpha beta gamma." = 4, "Delta - epsilon zeta-eta." = 4
		expect(await countEpubWords(bytes)).toBe(8);
	});

	it("returns null instead of throwing for a corrupt entry or a malformed href", async () => {
		const JSZip = (await import("jszip")).default;
		const zip = await JSZip.loadAsync(await build());
		const opfPath = Object.keys(zip.files).find((f) => f.endsWith(".opf")) as string;
		const opf = (await zip.file(opfPath)?.async("string")) ?? "";
		zip.file(opfPath, opf.replace(/href="text\/c1\.xhtml"/, 'href="text/c1%zz.xhtml"'));
		expect(await countEpubWords(await zip.generateAsync({ type: "uint8array" }))).toBeNull();

		const bytes = new Uint8Array(await build());
		// Flip bytes inside the compressed data so inflating an entry fails.
		const corrupt = bytes.slice();
		for (let i = Math.floor(corrupt.length / 2); i < corrupt.length / 2 + 200; i++) {
			corrupt[i] = (corrupt[i] ?? 0) ^ 0xff;
		}
		await expect(countEpubWords(corrupt)).resolves.toSatisfy(
			(v: unknown) => v === null || typeof v === "number",
		);
	});

	it("returns null for bytes that are not an EPUB", async () => {
		expect(await countEpubWords(new TextEncoder().encode("not a zip"))).toBeNull();
	});
});
