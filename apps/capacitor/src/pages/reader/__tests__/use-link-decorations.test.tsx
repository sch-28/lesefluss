import { utf8ByteLength, WordIndex } from "@lesefluss/core";
import { afterEach, describe, expect, it } from "vitest";
import type { LinkRange } from "../../../services/db/schema";
import { type Rendered, render } from "../../../test/render";
import { type LinkDecoration, useLinkDecorations } from "../use-link-decorations";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

/** Runs the hook over `content` laid out the way the reader splits it. */
async function decorate(
	content: string,
	storedLinks: LinkRange[] = [],
): Promise<{ links: Map<number, LinkDecoration[]>; words: string[] }> {
	const wordIndex = WordIndex.build(content);
	const paragraphs = content.split("\n\n");
	const paragraphOffsets: number[] = [];
	let offset = 0;
	for (const para of paragraphs) {
		paragraphOffsets.push(offset);
		offset += utf8ByteLength(para) + 2;
	}
	const paragraphStartWords = paragraphOffsets.map((b) => wordIndex.firstShownWord(b));

	let links = new Map<number, LinkDecoration[]>();
	function Probe() {
		links = useLinkDecorations({
			storedLinks,
			paragraphs,
			paragraphOffsets,
			paragraphStartWords,
			wordIndex,
		});
		return null;
	}
	view = await render(<Probe />);
	return { links, words: wordIndex.listEntries().map((e) => e.word) };
}

describe("useLinkDecorations: bare URLs", () => {
	it("decorates a bare URL in plain text as a link over its own word", async () => {
		const { links, words } = await decorate(
			"Intro line.\n\nVisit https://bare.example/page today.",
		);
		const [deco] = links.get(1) ?? [];
		expect(deco?.href).toBe("https://bare.example/page");
		expect(deco?.startWord).toBe(deco?.endWord);
		expect(words[deco?.startWord ?? -1]).toBe("https://bare.example/page");
		expect(links.has(0)).toBe(false);
	});

	it("leaves trailing punctuation out of the href", async () => {
		const { links } = await decorate("Notes (see https://bare.example/x).");
		expect(links.get(0)?.map((d) => d.href)).toEqual(["https://bare.example/x"]);
	});

	it("ignores a scheme with nothing after it and a URL glued to a word", async () => {
		const { links } = await decorate("Bare https:// and xhttps://glued.example here.");
		expect(links.size).toBe(0);
	});

	it("drops a bare URL that a stored link already covers", async () => {
		const content = "Read https://bare.example/doc now.";
		const wordIndex = WordIndex.build(content);
		const word = wordIndex.listEntries().findIndex((e) => e.word.startsWith("https"));
		const { links } = await decorate(content, [
			{ startWord: word, endWord: word, href: "https://stored.example" },
		]);
		expect(links.get(0)?.map((d) => d.href)).toEqual(["https://stored.example"]);
	});
});
