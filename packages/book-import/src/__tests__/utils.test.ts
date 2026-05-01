import { describe, expect, it } from "vitest";
import { extractParagraphs } from "../utils/dom-paragraphs";
import {
	displayHostname,
	extractEmbeddedUrl,
	isLikelyUrl,
	normalizeUrl,
} from "../utils/url-guards";

describe("url guards", () => {
	it("normalizes, validates, displays, and extracts URLs", () => {
		expect(normalizeUrl("example.com/page")).toBe("https://example.com/page");
		expect(isLikelyUrl("https://example.com/page")).toBe(true);
		expect(isLikelyUrl("ftp://example.com/page")).toBe(false);
		expect(displayHostname("https://www.example.com/page")).toBe("example.com");
		expect(extractEmbeddedUrl("Article title https://example.com/read.")).toBe(
			"https://example.com/read",
		);
	});
});

describe("extractParagraphs", () => {
	it("keeps headings and readable paragraph blocks", () => {
		const doc = new DOMParser().parseFromString(
			"<article><h1>1<br><span>Chapter One</span></h1><p>Hello <strong>reader</strong>.</p><ul><li>First</li><li>Second</li></ul></article>",
			"text/html",
		);

		expect(extractParagraphs(doc.body)).toBe("# Chapter One\n\nHello reader.\n\nFirst\n\nSecond");
	});
});
