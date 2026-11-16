import { afterEach, describe, expect, it, vi } from "vitest";
import type { Chapter } from "../../../services/db/schema";
import { flush, type Rendered, render } from "../../../test/render";

const { default: AnnotationsSheet } = await import("../annotations-sheet");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const chapters = [
	{ title: "One", startWord: 0, level: 0 },
	{ title: "Two", startWord: 100, level: 0 },
] as unknown as Chapter[];

async function open(onClose: () => void, onToggle: () => void) {
	view = await render(
		<AnnotationsSheet
			isOpen
			opensOnContents
			onClose={onClose}
			chapters={chapters}
			currentChapterIndex={0}
			onJumpChapter={() => {}}
			bookmarks={[]}
			currentBookmarkId={null}
			onJumpBookmark={() => {}}
			onRenameBookmark={() => {}}
			onDeleteBookmark={() => {}}
			highlights={[]}
			onJumpHighlight={() => {}}
			glossary={[]}
			currentBookId="b1"
			onOpenEntry={() => {}}
			onAddEntry={() => {}}
			browse={{ isBrowsing: false, onToggle }}
		/>,
	);
	await flush();
}

/** The drawer portals out of the render container. */
const buttonNamed = (name: string) =>
	[...document.body.querySelectorAll("button")].find(
		(b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
	);

describe("AnnotationsSheet", () => {
	it("has a visible title, a Close control and a labelled Browse toggle", async () => {
		const onClose = vi.fn();
		const onToggle = vi.fn();
		await open(onClose, onToggle);
		const dialog = document.body.querySelector('[role="dialog"]');
		const titleId = dialog?.getAttribute("aria-labelledby");
		const title = titleId ? document.getElementById(titleId) : null;
		expect(title?.textContent).toBe("Contents and annotations");
		expect(title?.className).not.toContain("sr-only");

		const browse = buttonNamed("Browse");
		expect(browse?.getAttribute("aria-pressed")).toBe("false");
		browse?.click();
		expect(onToggle).toHaveBeenCalledOnce();

		buttonNamed("Close")?.click();
		expect(onClose).toHaveBeenCalled();
	});
});
