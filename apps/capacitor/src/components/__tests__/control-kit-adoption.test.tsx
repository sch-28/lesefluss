import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadAloudControls } from "../../pages/reader/read-aloud-controls";
import { TTS_WPM_RANGE } from "../../pages/reader/wpm";
import type { Book } from "../../services/db/schema";
import { click, type Rendered, render } from "../../test/render";
import { SeriesNumberStep } from "../collections/series-number-step";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const readAloud = (wpm: number, onWpmChange = vi.fn()) =>
	render(
		<ReadAloudControls
			status="playing"
			wpm={wpm}
			measuredWpm={null}
			sleepTimer={{ endsAt: null, isAtChapterEnd: false }}
			isFollowing
			onTogglePlay={vi.fn()}
			onSkip={vi.fn()}
			onWpmChange={onWpmChange}
			onOpenSleepTimer={vi.fn()}
			onOpenVoice={vi.fn()}
			onStop={vi.fn()}
			onBackToVoice={vi.fn()}
			onReadFromView={vi.fn()}
		/>,
	);

describe("controls on the kit", () => {
	it("sets the voice speed in the read-aloud bar with the kit stepper, as RSVP does", async () => {
		const onWpmChange = vi.fn();
		view = await readAloud(200, onWpmChange);
		const stepper = view.container.querySelector('[data-slot="stepper"]');
		expect(stepper?.getAttribute("aria-label")).toBe("Voice speed");
		await click(view.getButton("Increase voice speed"));
		expect(onWpmChange).toHaveBeenCalledWith(200 + TTS_WPM_RANGE.step);
		expect(view.queryButton("Faster")).toBeNull();
	});

	it("stops the read-aloud stepper at the voice's top speed", async () => {
		const onWpmChange = vi.fn();
		view = await readAloud(TTS_WPM_RANGE.max, onWpmChange);
		await click(view.getButton("Increase voice speed"));
		expect(onWpmChange).not.toHaveBeenCalled();
	});

	it("picks a series numbering with the segmented control", async () => {
		view = await render(
			<SeriesNumberStep
				name="Red Rising"
				books={[{ id: "b1", title: "Red Rising" } as Book]}
				members={new Map()}
				isApplying={false}
				onBack={vi.fn()}
				onApply={vi.fn()}
			/>,
		);
		const control = view.container.querySelector('[data-slot="segmented-control"]');
		expect(control?.getAttribute("aria-label")).toBe("Numbering");
		expect(control?.querySelectorAll("button")).toHaveLength(3);
	});
});
