import JSZip from "jszip";

function xmlEscape(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export type FixtureChapter = {
	id: string;
	href: string;
	title?: string;
	body: string;
};

export type FixtureNavPoint = {
	label: string;
	href: string;
	children?: FixtureNavPoint[];
};

export type EpubFixture = {
	title?: string;
	creator?: string;
	chapters: FixtureChapter[];
	spineIds?: string[];
	navPoints?: FixtureNavPoint[];
	useEpub3Nav?: boolean;
	navHref?: string;
};

function xhtml(title: string, body: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xmlEscape(title)}</title></head><body>${body}</body></html>`;
}

function ncxNavPoints(points: FixtureNavPoint[], counter = { n: 0 }): string {
	return points
		.map((p) => {
			counter.n += 1;
			const id = `np${counter.n}`;
			const inner = p.children?.length ? ncxNavPoints(p.children, counter) : "";
			return `<navPoint id="${id}" playOrder="${counter.n}"><navLabel><text>${xmlEscape(p.label)}</text></navLabel><content src="${xmlEscape(p.href)}"/>${inner}</navPoint>`;
		})
		.join("");
}

function navOlItems(points: FixtureNavPoint[]): string {
	return points
		.map((p) => {
			const inner = p.children?.length ? `<ol>${navOlItems(p.children)}</ol>` : "";
			return `<li><a href="${xmlEscape(p.href)}">${xmlEscape(p.label)}</a>${inner}</li>`;
		})
		.join("");
}

function buildZip(fixture: EpubFixture): JSZip {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	zip.file(
		"META-INF/container.xml",
		`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
	);

	for (const c of fixture.chapters) {
		zip.file(c.href, xhtml(c.title ?? c.id, c.body));
	}

	const useNav = fixture.useEpub3Nav === true;
	const navHref = fixture.navHref ?? "nav.xhtml";
	const navPoints = fixture.navPoints ?? fixture.chapters.map((c) => ({ label: c.title ?? c.id, href: c.href }));

	const manifest = [
		...fixture.chapters.map(
			(c) =>
				`<item id="${xmlEscape(c.id)}" href="${xmlEscape(c.href)}" media-type="application/xhtml+xml"/>`,
		),
		useNav
			? `<item id="nav" href="${xmlEscape(navHref)}" media-type="application/xhtml+xml" properties="nav"/>`
			: `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
	].join("\n");

	const spineIds = fixture.spineIds ?? fixture.chapters.map((c) => c.id);
	const spine = spineIds.map((id) => `<itemref idref="${xmlEscape(id)}"/>`).join("\n");
	const spineAttr = useNav ? "" : ' toc="ncx"';

	zip.file(
		"content.opf",
		`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="${useNav ? "3.0" : "2.0"}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:test:fixture</dc:identifier>
<dc:title>${xmlEscape(fixture.title ?? "Test")}</dc:title>
<dc:creator>${xmlEscape(fixture.creator ?? "Tester")}</dc:creator>
<dc:language>en</dc:language>
</metadata>
<manifest>${manifest}</manifest>
<spine${spineAttr}>${spine}</spine>
</package>`,
	);

	if (useNav) {
		zip.file(
			navHref,
			`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>TOC</title></head>
<body><nav epub:type="toc" id="toc"><ol>${navOlItems(navPoints)}</ol></nav></body></html>`,
		);
	} else {
		zip.file(
			"toc.ncx",
			`<?xml version="1.0" encoding="utf-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
<head><meta content="urn:test" name="dtb:uid"/></head>
<docTitle><text>${xmlEscape(fixture.title ?? "Test")}</text></docTitle>
<navMap>${ncxNavPoints(navPoints)}</navMap>
</ncx>`,
		);
	}

	return zip;
}

export async function buildEpub(fixture: EpubFixture): Promise<ArrayBuffer> {
	return buildZip(fixture).generateAsync({ type: "arraybuffer" });
}

export async function buildEpubBuffer(fixture: EpubFixture): Promise<Buffer> {
	return buildZip(fixture).generateAsync({ type: "nodebuffer" });
}

/**
 * Reproducer for the Golden Son content-loss bug: EPUB2 chapter files with `.htm`
 * extension and self-closed page anchors (`<a id="pageN"/>`) at the heading and
 * mid-paragraph positions that triggered HTML5's adoption-agency reshuffle in
 * Chromium WebView, dropping ~85% of chapter content before the xhtml-mime fix.
 */
export function strayAnchorFixture(): EpubFixture {
	const ch = (n: number) =>
		`<h1 class="chapter"><a id="p${n}a"/><a id="p${n}b"/>${n}</h1>` +
		`<h1 class="chapter2"><img alt="" src="ornament.jpg"/></h1>` +
		`<h1 class="subchapter"><strong>TITLE ${n}</strong></h1>` +
		`<p class="nonindent">Chapter ${n} opening paragraph anchors the scene.</p>` +
		`<p class="indent">Chapter ${n} second paragraph develops <a id="p${n}c"/>the moment with an embedded anchor.</p>` +
		`<p class="indent"><a id="p${n}d"/>"Chapter ${n} third paragraph with leading anchor."</p>` +
		`<p class="indent">Chapter ${n} fourth paragraph continues here.</p>` +
		`<p class="indent"><a id="p${n}e"/>Chapter ${n} fifth paragraph also leads with an anchor.</p>` +
		`<p class="indent">Chapter ${n} sixth paragraph closes <a id="p${n}f"/>the chapter completely.</p>`;
	return {
		title: "Stray Anchor Test",
		chapters: [
			{ id: "c1", href: "c1.htm", body: ch(1) },
			{ id: "c2", href: "c2.htm", body: ch(2) },
		],
		navPoints: [
			{ label: "1: First", href: "c1.htm" },
			{ label: "2: Second", href: "c2.htm" },
		],
	};
}
