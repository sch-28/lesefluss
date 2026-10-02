import { describe, expect, it } from "vitest";
import { epubParser, loadEpubImages } from "../parsers/epub";
import {
	buildEpub,
	type EpubFixture,
	imageFixture,
	strayAnchorFixture,
	withoutImages,
} from "../test-fixtures/build-epub";
import { extractParagraphs, extractParagraphsWithLinks } from "../utils/dom-paragraphs";

function parse(html: string): Element {
	return new DOMParser().parseFromString(`<article>${html}</article>`, "text/html").body;
}

describe("extractParagraphsWithLinks images", () => {
	it("leaves content untouched and anchors a block image to the next text", () => {
		const html = '<p>Before.</p><img src="a.png" alt="A"/><p>After.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("Before.\n\nAfter.");
		expect(content).toBe(extractParagraphs(parse(html)));
		expect(images).toEqual([{ src: "a.png", alt: "A", charOffset: content.indexOf("After.") }]);
	});

	it("captures img inside figure, picture, div wrappers and SVG image", () => {
		const html =
			'<figure><img src="f.png" alt="fig"/><figcaption>Cap</figcaption></figure>' +
			'<picture><source srcset="x.webp"/><img src="p.png"/></picture>' +
			'<div><div><img src="d.png"/></div></div>' +
			'<svg xmlns="http://www.w3.org/2000/svg"><image href="s.png"/></svg>' +
			"<p>Text.</p>";
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("Text.");
		expect(images.map((i) => i.src)).toEqual(["f.png", "p.png", "d.png", "s.png"]);
		expect(images.every((i) => i.charOffset === 0)).toBe(true);
	});

	it("reads xlink:href on SVG image", () => {
		const doc = new DOMParser().parseFromString(
			'<html xmlns="http://www.w3.org/1999/xhtml"><body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="map.jpg"/></svg><p>Hi.</p></body></html>',
			"application/xhtml+xml",
		);
		const { images } = extractParagraphsWithLinks(doc.body);
		expect(images.map((i) => i.src)).toEqual(["map.jpg"]);
	});

	it("anchors an image inside a paragraph to that paragraph's start", () => {
		const html = '<p>One.</p><p><img src="drop.png" alt="D"/>Two.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("One.\n\nTwo.");
		expect(images).toEqual([{ src: "drop.png", alt: "D", charOffset: 6 }]);
	});

	it("captures an image used as a heading, without changing heading text handling", () => {
		const html = '<h1><img src="ch.png" alt="1 Dawn"/></h1><h2>Real</h2><p>Body.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("## Real\n\nBody.");
		expect(images).toEqual([{ src: "ch.png", alt: "1 Dawn", charOffset: 0 }]);
	});

	it("collapses the same image repeated at the same anchor, keeps it elsewhere", () => {
		const html =
			'<div><img src="o.png"/><img src="o.png"/></div><p>A.</p><img src="o.png"/><p>B.</p>';
		const { images } = extractParagraphsWithLinks(parse(html));
		expect(images.map((i) => [i.src, i.charOffset])).toEqual([
			["o.png", 0],
			["o.png", 4],
		]);
	});

	it("anchors a trailing image at content length", () => {
		const html = '<p>End.</p><img src="t.png"/>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(images).toEqual([{ src: "t.png", alt: "", charOffset: content.length }]);
	});

	it("returns images for a body with no text at all", () => {
		const { content, images } = extractParagraphsWithLinks(parse('<div><img src="m.png"/></div>'));
		expect(content).toBe("");
		expect(images).toEqual([{ src: "m.png", alt: "", charOffset: 0 }]);
	});

	it("anchors an image after loose wrapper text to the text that follows", () => {
		const html = '<div>Intro text<img src="a.png"/></div><p>Next.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("Intro text\n\nNext.");
		expect(images).toEqual([{ src: "a.png", alt: "", charOffset: content.indexOf("Next.") }]);
	});

	it("keeps an image before loose wrapper text anchored to that text", () => {
		const html = '<div><img src="a.png"/>Intro text</div><p>Next.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("Intro text\n\nNext.");
		expect(images).toEqual([{ src: "a.png", alt: "", charOffset: 0 }]);
	});

	it("captures an image wrapped in an inline element inside a div", () => {
		const html =
			'<div class="figcenter"><a href="images/i_001.jpg"><img src="images/i_001.jpg" alt="Plate I"/></a></div><p>After.</p>';
		const { content, images } = extractParagraphsWithLinks(parse(html));
		expect(content).toBe("After.");
		expect(images).toEqual([{ src: "images/i_001.jpg", alt: "Plate I", charOffset: 0 }]);
	});

	it("ignores images without a src", () => {
		const { images } = extractParagraphsWithLinks(parse('<img alt="x"/><p>Hi.</p>'));
		expect(images).toEqual([]);
	});
});

describe("epubParser images", () => {
	it("keeps content, chapters and links identical and emits byte anchors", async () => {
		const fixture = imageFixture();
		const bytes = await buildEpub(fixture);
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "images.epub" });

		// Byte-identical to the pre-image importer: the map page has no text, so
		// it contributes nothing; headings come from the TOC.
		expect(r.content).toBe(
			"# One\n\nFirst paragraph here.\n\nSecond paragraph here.\n\n# Two\n\nThird paragraph here.",
		);
		expect(r.chapters?.map((c) => c.title)).toEqual(["One", "Two"]);

		expect(r.images?.map((i) => i.key).sort()).toEqual([
			"/images/ch1.png",
			"/images/map.png",
			"/images/orn.png",
		]);
		for (const img of r.images ?? []) {
			expect(img.mime).toBe("image/png");
			expect(img.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
			expect(img.width).toBe(1);
			expect(img.height).toBe(1);
		}

		const at = (needle: string) => Buffer.byteLength(r.content.slice(0, r.content.indexOf(needle)));
		expect(r.imageAnchors).toEqual([
			// The map page carried into chapter one precedes its injected TOC
			// heading; the heading art and the twins precede the first paragraph.
			{ key: "/images/map.png", alt: "The map", startByte: 0 },
			{ key: "/images/ch1.png", alt: "1 Dawn", startByte: at("First") },
			{ key: "/images/orn.png", alt: "", startByte: at("First") },
			{ key: "/images/orn.png", alt: "drop", startByte: at("Second") },
			{ key: "/images/map.png", alt: "", startByte: Buffer.byteLength(r.content) },
		]);
	});

	it("skips an image missing from the archive and still imports", async () => {
		const fixture = imageFixture();
		fixture.chapters[1].body += '<p><img src="../images/missing.png"/>Tail.</p>';
		const bytes = await buildEpub(fixture);
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "images.epub" });
		expect(r.content).toContain("Tail.");
		expect(r.imageAnchors?.some((a) => a.key.endsWith("missing.png"))).toBe(false);
		expect(r.images?.some((i) => i.key.endsWith("missing.png"))).toBe(false);
	});

	it("reports no images for a book without any", async () => {
		const bytes = await buildEpub({
			chapters: [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Hi.</p>" }],
		});
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "plain.epub" });
		expect(r.images).toBeNull();
		expect(r.imageAnchors).toBeNull();
	});

	it("loads only the requested images by archive path for a repair", async () => {
		const bytes = await buildEpub(imageFixture());
		const images = await loadEpubImages(bytes, [
			"/images/orn.png",
			"/images/map.png",
			"/images/nope.png",
		]);
		expect(images.map((i) => i.key).sort()).toEqual(["/images/map.png", "/images/orn.png"]);
		expect(images.every((i) => i.dataUrl.startsWith("data:image/png;base64,"))).toBe(true);
	});

	it("skips an image whose header declares more pixels than the decode cap", async () => {
		// A PNG signature + IHDR declaring 20000x20000, then nothing: 400 KB of flat
		// colour would pass the byte cap, and the reader would decode 1.6 GB.
		const ihdr = Buffer.alloc(33);
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
		ihdr.writeUInt32BE(13, 8);
		ihdr.write("IHDR", 12);
		ihdr.writeUInt32BE(20000, 16);
		ihdr.writeUInt32BE(20000, 20);
		const fixture: EpubFixture = {
			...imageFixture(),
			images: [
				{ href: "images/huge.png", base64: ihdr.toString("base64"), mediaType: "image/png" },
			],
			chapters: [
				{
					id: "c1",
					href: "text/c1.xhtml",
					title: "One",
					body: '<p><img src="../images/huge.png"/>Hi.</p>',
				},
			],
			navPoints: [{ label: "One", href: "text/c1.xhtml" }],
		};
		const bytes = await buildEpub(fixture);
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "huge.epub" });
		expect(r.content).toBe("# One\n\nHi.");
		expect(r.images).toBeNull();
		expect(r.imageAnchors).toBeNull();
	});

	it("gives the reader fixture the same text, chapters and links with and without its images", async () => {
		const withImgs = await epubParser.parse({
			kind: "bytes",
			bytes: await buildEpub(strayAnchorFixture()),
			fileName: "a.epub",
		});
		const plain = await epubParser.parse({
			kind: "bytes",
			bytes: await buildEpub(withoutImages(strayAnchorFixture())),
			fileName: "b.epub",
		});
		expect(plain.content).toContain("Chapter 2 sixth paragraph");
		expect(withImgs.content).toBe(plain.content);
		expect(withImgs.chapters).toEqual(plain.chapters);
		expect(withImgs.linkRanges).toEqual(plain.linkRanges);
		expect(withImgs.images?.map((i) => i.key).sort()).toEqual([
			"/images/art.png",
			"/images/map.png",
			"/images/ornament.png",
			"/images/plate.png",
		]);
		// map page, 2 chapters x (heading art, plate, in-paragraph ornament), trailing plate
		expect(withImgs.imageAnchors).toHaveLength(8);
	});
});
