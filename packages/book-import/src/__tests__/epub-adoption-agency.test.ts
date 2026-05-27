// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { epubParser } from "../parsers/epub";
import { buildEpub } from "../test-fixtures/build-epub";

// EPUB2 chapters embed self-closed page anchors (`<p>text<a id="page9"/>more</p>`).
// In text/html mode, HTML5's adoption agency reshuffles `<p>` out of body's direct
// children. Forced xhtml mime in the parser avoids that; jsdom env reproduces the
// quirk so the regression is locked in.

async function parse(bytes: ArrayBuffer) {
	return epubParser.parse({ kind: "bytes", bytes, fileName: "stray-anchors.epub" });
}

// Guard: if the `// @vitest-environment jsdom` directive ever silently falls
// back (jsdom missing, vitest config override), the adoption-agency reshuffle
// won't fire and the regression check becomes meaningless. Fail loudly here.
describe("epub parser under jsdom (HTML5 spec-strict)", () => {
	it("runs under jsdom, not happy-dom", () => {
		expect(navigator.userAgent.toLowerCase()).toContain("jsdom");
	});

	it("keeps every paragraph when chapters contain self-closed page anchors", async () => {
		const body = `
<h1 class="chapter"><a id="page2"/><a id="page3"/>1</h1>
<h1 class="subchapter"><strong>WARLORDS</strong></h1>
<p class="nonindent">First paragraph before any page anchor.</p>
<p class="indent">Second paragraph, still before any anchor.</p>
<p class="indent"><a id="page4"/>Third paragraph, opens with a self-closed anchor.</p>
<p class="indent">Fourth paragraph after the page-4 anchor.</p>
<p class="indent">Fifth paragraph with <a id="page5"/>an inline anchor mid-flow.</p>
<p class="indent">Sixth and final paragraph of the chapter.</p>
`.trim();
		const bytes = await buildEpub({
			chapters: [{ id: "c1", href: "c1.htm", body }],
			navPoints: [{ label: "1: Warlords", href: "c1.htm" }],
		});
		const r = await parse(bytes);
		for (const phrase of [
			"WARLORDS",
			"First paragraph before any page anchor.",
			"Second paragraph, still before any anchor.",
			"Third paragraph, opens with a self-closed anchor.",
			"Fourth paragraph after the page-4 anchor.",
			"Fifth paragraph with an inline anchor mid-flow.",
			"Sixth and final paragraph of the chapter.",
		]) {
			expect(r.content).toContain(phrase);
		}
	});

	it("keeps chapter boundaries when stray anchors split multiple chapters", async () => {
		const mk = (n: number) =>
			`<h1><a id="p${n}a"/>${n}</h1><h1><strong>TITLE ${n}</strong></h1>` +
			`<p>Ch${n} para 1.</p>` +
			`<p><a id="p${n}b"/>Ch${n} para 2.</p>` +
			`<p>Ch${n} para 3 with <a id="p${n}c"/>inline.</p>` +
			`<p>Ch${n} para 4 final.</p>`;
		const bytes = await buildEpub({
			chapters: [
				{ id: "c1", href: "c1.htm", body: mk(1) },
				{ id: "c2", href: "c2.htm", body: mk(2) },
			],
			navPoints: [
				{ label: "1: One", href: "c1.htm" },
				{ label: "2: Two", href: "c2.htm" },
			],
		});
		const r = await parse(bytes);
		for (let n = 1; n <= 2; n++) {
			expect(r.content).toContain(`TITLE ${n}`);
			expect(r.content).toContain(`Ch${n} para 1.`);
			expect(r.content).toContain(`Ch${n} para 2.`);
			expect(r.content).toContain(`Ch${n} para 3 with inline.`);
			expect(r.content).toContain(`Ch${n} para 4 final.`);
		}
		expect(r.chapters?.map((c) => c.title)).toEqual(["1: One", "2: Two"]);
	});
});
