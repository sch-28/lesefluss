import { describe, expect, it } from "vitest";
import { parseHtml, stripHidden } from "../../utils/html";

describe("parseHtml", () => {
	it("returns a parsed Document whose body is queryable", () => {
		const doc = parseHtml("<html><body><p>hi</p></body></html>");
		// happy-dom returns HTMLDocument; instanceOf Document is unreliable across
		// DOM impls, so check the contract we actually depend on.
		expect(doc.querySelector("p")?.textContent).toBe("hi");
	});
});

describe("stripHidden", () => {
	function buildRoot(html: string): Element {
		const doc = parseHtml(`<html><body><div id="root">${html}</div></body></html>`);
		const root = doc.getElementById("root");
		if (!root) throw new Error("test-only: root not found");
		return root;
	}

	it("removes display:none, visibility:hidden, [hidden], [aria-hidden=true]", () => {
		const root = buildRoot(`
			<p id="visible">keep</p>
			<p id="display" style="display:none">drop</p>
			<p id="display-spaced" style="display: none">drop</p>
			<p id="vis" style="visibility:hidden">drop</p>
			<p id="hidden-attr" hidden>drop</p>
			<p id="aria" aria-hidden="true">drop</p>
		`);
		stripHidden(root);
		expect(root.querySelector("#visible")).not.toBeNull();
		expect(root.querySelector("#display")).toBeNull();
		expect(root.querySelector("#display-spaced")).toBeNull();
		expect(root.querySelector("#vis")).toBeNull();
		expect(root.querySelector("#hidden-attr")).toBeNull();
		expect(root.querySelector("#aria")).toBeNull();
	});

	it("does NOT remove substring matches like display:none-on-scroll", () => {
		const root = buildRoot(
			`<p id="trick" style="display:none-on-scroll">keep</p>
			 <p id="vis-trick" style="visibility:hidden-fade">keep</p>`,
		);
		stripHidden(root);
		expect(root.querySelector("#trick")).not.toBeNull();
		expect(root.querySelector("#vis-trick")).not.toBeNull();
	});

	it("handles aria-hidden=false correctly (keeps it)", () => {
		const root = buildRoot(`<p id="a" aria-hidden="false">keep</p>`);
		stripHidden(root);
		expect(root.querySelector("#a")).not.toBeNull();
	});
});
