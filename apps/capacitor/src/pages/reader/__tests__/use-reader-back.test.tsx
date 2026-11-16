import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { BrowseController } from "../browse-controller";
import { useReaderBack } from "../use-reader-back";

type Props = Parameters<typeof useReaderBack>[0];

function Probe(props: Props) {
	useReaderBack(props);
	return null;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function pressBack(): boolean {
	let consumed = false;
	act(() => {
		consumed = consumeBackPress();
	});
	return consumed;
}

function browseAt(persisted: number) {
	const state = { lastWord: persisted as number | null, persisted: persisted as number | null };
	const writes: number[] = [];
	const controller = new BrowseController({
		getLastWord: () => state.lastWord,
		getPersistedWord: () => state.persisted,
		isRsvp: () => false,
		writePosition: (word) => {
			writes.push(word);
			state.persisted = word;
		},
		showUnsavedMove: (word) => {
			state.lastWord = word;
		},
		getSession: () => null,
		onAnchorChange: () => {},
		notifyAutoCommit: () => {},
		now: () => 0,
	});
	return { state, writes, controller };
}

const idle: Props = {
	isSelecting: false,
	isRsvp: false,
	isBrowsing: false,
	cancelSelection: () => {},
	leaveRsvp: () => {},
	browseBack: () => {},
};

describe("reader Android back", () => {
	it("leaves the book when no mode is on", async () => {
		view = await render(<Probe {...idle} />);
		expect(pressBack()).toBe(false);
	});

	it("goes back from browse to the reading position, saving nothing", async () => {
		const browse = browseAt(1_000);
		browse.controller.enterForJump(5_000);
		browse.state.lastWord = 5_000;
		view = await render(
			<Probe
				{...idle}
				isBrowsing={browse.controller.isBrowsing}
				browseBack={browse.controller.back}
			/>,
		);
		expect(pressBack()).toBe(true);
		expect(browse.controller.isBrowsing).toBe(false);
		expect(browse.state.lastWord).toBe(1_000);
		expect(browse.state.persisted).toBe(1_000);
		expect(browse.writes).toEqual([]);
	});

	it("leaves RSVP through the toggle's exit", async () => {
		const leaveRsvp = vi.fn();
		const browseBack = vi.fn();
		view = await render(<Probe {...idle} isRsvp leaveRsvp={leaveRsvp} browseBack={browseBack} />);
		expect(pressBack()).toBe(true);
		expect(leaveRsvp).toHaveBeenCalledTimes(1);
		expect(browseBack).not.toHaveBeenCalled();
	});

	it("clears a selection first, and leaves the mode alone", async () => {
		const cancelSelection = vi.fn();
		const leaveRsvp = vi.fn();
		view = await render(
			<Probe
				{...idle}
				isSelecting
				isRsvp
				cancelSelection={cancelSelection}
				leaveRsvp={leaveRsvp}
			/>,
		);
		expect(pressBack()).toBe(true);
		expect(cancelSelection).toHaveBeenCalledTimes(1);
		expect(leaveRsvp).not.toHaveBeenCalled();
	});

	it("lets an overlay opened on top close first", async () => {
		const leaveRsvp = vi.fn();
		view = await render(<Probe {...idle} isRsvp leaveRsvp={leaveRsvp} />);
		const { pushBackHandler } = await import("@lesefluss/ui/overlay-back");
		const closeSheet = vi.fn(() => true);
		const unregister = pushBackHandler(closeSheet);
		expect(pressBack()).toBe(true);
		expect(closeSheet).toHaveBeenCalledTimes(1);
		expect(leaveRsvp).not.toHaveBeenCalled();
		unregister();
	});
});
