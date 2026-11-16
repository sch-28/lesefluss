import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { chapterIndexAt, useScrubProgress } from "../use-scrub-progress";

const jumpToWord = vi.fn();
const savePosition = vi.fn();
const setProgressBarVisible = vi.fn();
const setRsvpInitWord = vi.fn();

function Harness({ readerMode = "standard" }: { readerMode?: "standard" | "rsvp" }) {
	const scrub = useScrubProgress({
		book: makeBook({ id: "b1" }),
		readerMode,
		totalWords: 1000,
		paragraphStartWords: [0, 250, 500, 750],
		findParagraphIndexForWord: (w) => Math.floor(w / 250),
		jumpToWord,
		savePosition,
		lastWordRef: { current: 0 },
		setProgressWord: vi.fn(),
		setRsvpInitWord,
		setProgressBarVisible,
		isReadingAloud: () => false,
	});
	return (
		<div
			ref={scrub.progressBarRef}
			data-testid="bar"
			data-preview={scrub.previewWord ?? ""}
			data-info={String(scrub.isShowingInfo)}
			onPointerDown={scrub.handleProgressPointerDown}
			onPointerMove={scrub.handleProgressPointerMove}
			onPointerUp={scrub.handleProgressPointerUp}
			onPointerCancel={scrub.handleProgressPointerCancel}
		/>
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
	vi.useRealTimers();
});

async function mount(readerMode?: "standard" | "rsvp") {
	view = await render(<Harness readerMode={readerMode} />);
	const bar = view.container.querySelector<HTMLDivElement>('[data-testid="bar"]');
	if (!bar) throw new Error("no bar");
	bar.setPointerCapture = vi.fn();
	bar.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 40 }) as DOMRect;
	return bar;
}

function pointer(bar: HTMLElement, type: string, clientX: number, buttons = 1) {
	act(() => {
		bar.dispatchEvent(
			new PointerEvent(type, { bubbles: true, clientX, clientY: 20, buttons, pointerId: 1 }),
		);
	});
}

describe("useScrubProgress", () => {
	it("a tap shows the position and never moves it", async () => {
		vi.useFakeTimers();
		const bar = await mount();
		pointer(bar, "pointerdown", 800);
		pointer(bar, "pointerup", 802, 0);
		expect(jumpToWord).not.toHaveBeenCalled();
		expect(savePosition).not.toHaveBeenCalled();
		expect(setProgressBarVisible).toHaveBeenCalledWith(true);
		expect(bar.dataset.info).toBe("true");
		act(() => vi.advanceTimersByTime(3000));
		expect(bar.dataset.info).toBe("false");
	});

	it("a drag previews its target and jumps only on release", async () => {
		const bar = await mount();
		pointer(bar, "pointerdown", 100);
		pointer(bar, "pointermove", 300);
		pointer(bar, "pointermove", 620);
		expect(bar.dataset.preview).toBe("620");
		expect(jumpToWord).not.toHaveBeenCalled();
		pointer(bar, "pointerup", 620, 0);
		expect(jumpToWord).toHaveBeenCalledTimes(1);
		expect(jumpToWord).toHaveBeenCalledWith(500, { highlight: false });
		expect(bar.dataset.preview).toBe("");
	});

	it("a cancelled drag jumps nowhere", async () => {
		const bar = await mount();
		pointer(bar, "pointerdown", 100);
		pointer(bar, "pointermove", 600);
		pointer(bar, "pointercancel", 600, 0);
		expect(jumpToWord).not.toHaveBeenCalled();
		expect(bar.dataset.preview).toBe("");
	});

	it("in RSVP a drag saves the released word once", async () => {
		const bar = await mount("rsvp");
		pointer(bar, "pointerdown", 100);
		pointer(bar, "pointermove", 400);
		pointer(bar, "pointermove", 450);
		expect(savePosition).not.toHaveBeenCalled();
		pointer(bar, "pointerup", 450, 0);
		expect(savePosition).toHaveBeenCalledTimes(1);
		expect(savePosition).toHaveBeenCalledWith(450, "scrub");
		expect(setRsvpInitWord).toHaveBeenCalledWith(450);
	});
});

describe("chapterIndexAt", () => {
	it("finds the chapter holding a word", () => {
		const chapters = [{ startWord: 10 }, { startWord: 100 }];
		expect(chapterIndexAt([], 5)).toBe(-1);
		expect(chapterIndexAt(chapters, 0)).toBe(0);
		expect(chapterIndexAt(chapters, 99)).toBe(0);
		expect(chapterIndexAt(chapters, 100)).toBe(1);
	});
});
