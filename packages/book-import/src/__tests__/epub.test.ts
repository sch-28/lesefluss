import { describe, expect, it } from "vitest";
import { epubParser } from "../parsers/epub";
import { buildEpub } from "../test-fixtures/build-epub";
import { utf8ByteLength } from "../utils/encoding";

async function parse(bytes: ArrayBuffer) {
	return epubParser.parse({ kind: "bytes", bytes, fileName: "test.epub" });
}

describe("epubParser", () => {
	it("joins spine sections with \\n\\n and reports epub format", async () => {
		const bytes = await buildEpub({
			title: "My Book",
			creator: "Alice",
			chapters: [
				{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Hello.</p>" },
				{ id: "c2", href: "c2.xhtml", title: "Two", body: "<p>World.</p>" },
			],
		});
		const r = await parse(bytes);
		expect(r.fileFormat).toBe("epub");
		expect(r.content).toBe("Hello.\n\nWorld.");
	});

	it("emits chapter markers for a flat NCX", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Alpha.</p>" },
				{ id: "c2", href: "c2.xhtml", title: "Two", body: "<p>Beta.</p>" },
			],
		});
		const r = await parse(bytes);
		expect(r.chapters?.map((c) => c.title)).toEqual(["One", "Two"]);
		expect(r.chapters?.[0].startByte).toBe(0);
		expect(r.chapters?.[1].startByte).toBe(utf8ByteLength("Alpha.") + 2);
	});

	it("emits chapter markers for a nested NCX (chapters under parts)", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "p1", href: "p1.xhtml", body: "<p>Part 1.</p>" },
				{ id: "c1", href: "c1.xhtml", body: "<p>Chapter 1 body.</p>" },
				{ id: "c2", href: "c2.xhtml", body: "<p>Chapter 2 body.</p>" },
				{ id: "p2", href: "p2.xhtml", body: "<p>Part 2.</p>" },
				{ id: "c3", href: "c3.xhtml", body: "<p>Chapter 3 body.</p>" },
			],
			navPoints: [
				{
					label: "Part I",
					href: "p1.xhtml",
					children: [
						{ label: "1: Alpha", href: "c1.xhtml" },
						{ label: "2: Beta", href: "c2.xhtml" },
					],
				},
				{
					label: "Part II",
					href: "p2.xhtml",
					children: [{ label: "3: Gamma", href: "c3.xhtml" }],
				},
			],
		});
		const r = await parse(bytes);
		expect(r.chapters?.map((c) => c.title)).toEqual([
			"Part I",
			"1: Alpha",
			"2: Beta",
			"Part II",
			"3: Gamma",
		]);
	});

	it("ignores fragment identifiers in TOC href", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "c1", href: "c1.xhtml", body: "<p>A.</p>" },
				{ id: "c2", href: "c2.xhtml", body: "<p>B.</p>" },
			],
			navPoints: [
				{ label: "Anchored", href: "c1.xhtml#top" },
				{ label: "Plain", href: "c2.xhtml" },
			],
		});
		const r = await parse(bytes);
		expect(r.chapters?.map((c) => c.title)).toEqual(["Anchored", "Plain"]);
	});

	it("computes byte offsets correctly for multi-byte UTF-8 content", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Café—€</p>" },
				{ id: "c2", href: "c2.xhtml", title: "Two", body: "<p>Tail.</p>" },
			],
		});
		const r = await parse(bytes);
		const firstBytes = utf8ByteLength("Café—€");
		expect(firstBytes).toBeGreaterThan("Café—€".length);
		expect(r.chapters?.[1].startByte).toBe(firstBytes + 2);
	});

	it("skips sections with no extractable text without breaking chapter offsets", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "empty", href: "empty.xhtml", body: "<div></div>" },
				{ id: "c1", href: "c1.xhtml", title: "Real", body: "<p>Body.</p>" },
			],
			navPoints: [
				{ label: "Empty Front", href: "empty.xhtml" },
				{ label: "Real", href: "c1.xhtml" },
			],
		});
		const r = await parse(bytes);
		// Empty section dropped from sections[]; its TOC entry has no matching href.
		expect(r.chapters?.map((c) => c.title)).toEqual(["Real"]);
		expect(r.chapters?.[0].startByte).toBe(0);
		expect(r.content).toBe("Body.");
	});

	// happy-dom's CSS selector engine cannot parse epubjs's `nav[*|type="toc"]` namespace
	// selector, so EPUB3 nav docs cannot be exercised in this test env. Real browsers
	// (and the Capacitor WebView) handle it, so this path works in production.
	it.skip("supports EPUB3 nav.xhtml in place of NCX", async () => {
		const bytes = await buildEpub({
			useEpub3Nav: true,
			chapters: [
				{ id: "c1", href: "c1.xhtml", body: "<p>One.</p>" },
				{ id: "c2", href: "c2.xhtml", body: "<p>Two.</p>" },
			],
			navPoints: [
				{ label: "First", href: "c1.xhtml" },
				{ label: "Second", href: "c2.xhtml" },
			],
		});
		const r = await parse(bytes);
		expect(r.chapters?.map((c) => c.title)).toEqual(["First", "Second"]);
	});

	it("handles spine items not present in TOC (front-matter without TOC entry)", async () => {
		const bytes = await buildEpub({
			chapters: [
				{ id: "cover", href: "cover.xhtml", body: "<p>Cover page.</p>" },
				{ id: "c1", href: "c1.xhtml", body: "<p>Chapter body.</p>" },
			],
			navPoints: [{ label: "Chapter One", href: "c1.xhtml" }],
		});
		const r = await parse(bytes);
		expect(r.chapters).toHaveLength(1);
		expect(r.chapters?.[0].title).toBe("Chapter One");
		expect(r.chapters?.[0].startByte).toBe(utf8ByteLength("Cover page.") + 2);
	});

	it("falls back to filename when metadata title is missing", async () => {
		const bytes = await buildEpub({
			title: "",
			chapters: [{ id: "c1", href: "c1.xhtml", body: "<p>x</p>" }],
		});
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "Some File.epub" });
		expect(r.title).toBe("Some File");
	});
});
