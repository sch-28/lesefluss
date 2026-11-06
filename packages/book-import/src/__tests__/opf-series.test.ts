import { describe, expect, it } from "vitest";
import { epubParser } from "../parsers/epub";
import { readOpfSeries, SERIES_NAME_MAX } from "../parsers/opf-series";
import { buildEpub } from "../test-fixtures/build-epub";

function opf(metadata: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>T</dc:title>
${metadata}
</metadata>
</package>`;
}

const CALIBRE =
	'<meta name="calibre:series" content="  Red Rising "/><meta name="calibre:series_index" content="3.0"/>';
const EPUB3 =
	'<meta property="belongs-to-collection" id="c1">Foundation</meta><meta refines="#c1" property="collection-type">series</meta><meta refines="#c1" property="group-position">2.5</meta>';

describe("readOpfSeries", () => {
	it("reads calibre's series and number, trimmed", () => {
		expect(readOpfSeries(opf(CALIBRE))).toEqual({ seriesName: "Red Rising", seriesIndex: 3 });
	});

	it("reads meta written with the OPF namespace prefix", () => {
		const prefixed =
			'<opf:meta name="calibre:series" content="Dune"/><opf:meta name="calibre:series_index" content="1"/>';
		expect(readOpfSeries(opf(prefixed))).toEqual({ seriesName: "Dune", seriesIndex: 1 });
	});

	it("reads an EPUB 3 series collection with its group position", () => {
		expect(readOpfSeries(opf(EPUB3))).toEqual({ seriesName: "Foundation", seriesIndex: 2.5 });
	});

	it("prefers calibre when both are present", () => {
		expect(readOpfSeries(opf(EPUB3 + CALIBRE)).seriesName).toBe("Red Rising");
	});

	it("takes an untyped collection, but never a set, and a typed series first", () => {
		const untyped = '<meta property="belongs-to-collection" id="u">Dune</meta>';
		const set =
			'<meta property="belongs-to-collection" id="s">Penguin Classics</meta><meta refines="#s" property="collection-type">set</meta>';
		expect(readOpfSeries(opf(untyped))).toEqual({ seriesName: "Dune", seriesIndex: null });
		expect(readOpfSeries(opf(set))).toEqual({ seriesName: null, seriesIndex: null });
		expect(readOpfSeries(opf(set + untyped + EPUB3)).seriesName).toBe("Foundation");
	});

	it("leaves both empty without series metadata", () => {
		expect(readOpfSeries(opf(""))).toEqual({ seriesName: null, seriesIndex: null });
		expect(readOpfSeries(opf('<meta name="calibre:series" content="   "/>'))).toEqual({
			seriesName: null,
			seriesIndex: null,
		});
	});

	it("keeps the name but drops a number that is not one", () => {
		for (const bad of ["abc", "-1", "", "1e3", "2,5", "999999999"]) {
			const meta = `<meta name="calibre:series" content="S"/><meta name="calibre:series_index" content="${bad}"/>`;
			expect(readOpfSeries(opf(meta))).toEqual({ seriesName: "S", seriesIndex: null });
		}
	});

	it("caps a long name and survives broken XML", () => {
		const long = "x".repeat(SERIES_NAME_MAX + 50);
		const meta = `<meta name="calibre:series" content="${long}"/>`;
		expect(readOpfSeries(opf(meta)).seriesName).toHaveLength(SERIES_NAME_MAX);
		expect(readOpfSeries("<package><metadata>")).toEqual({ seriesName: null, seriesIndex: null });
	});
});

describe("epubParser series", () => {
	const chapters = [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Hi.</p>" }];
	const parse = (bytes: ArrayBuffer) =>
		epubParser.parse({ kind: "bytes", bytes, fileName: "test.epub" });

	it("carries the OPF series into the payload", async () => {
		const r = await parse(await buildEpub({ chapters, extraMetadata: CALIBRE }));
		expect(r.seriesName).toBe("Red Rising");
		expect(r.seriesIndex).toBe(3);
	});

	it("leaves the series empty for an EPUB without one", async () => {
		const r = await parse(await buildEpub({ chapters }));
		expect(r.seriesName).toBeNull();
		expect(r.seriesIndex).toBeNull();
	});
});
