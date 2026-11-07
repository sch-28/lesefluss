import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { createNavigateEmitter } from "../../reader/reader-api/legacy-adapter";
import { useMiniTakeover } from "../use-mini-takeover";

const navigateEmitter = createNavigateEmitter();
const takeover = vi.fn();
let isMiniSave = false;
let isReconciling = false;
const flags = { isMiniSave: () => isMiniSave, isReconcilingJump: () => isReconciling };

function Harness({ browseAnchor }: { browseAnchor: number | null }) {
	useMiniTakeover({ takeover, navigateEmitter, browseAnchor, ...flags });
	return null;
}

let rendered: Rendered | null = null;
afterEach(() => {
	rendered?.unmount();
	rendered = null;
	takeover.mockClear();
	isMiniSave = false;
	isReconciling = false;
});

describe("mini takeover", () => {
	it("takes the mini over at the anchor when the reader enters browse", async () => {
		rendered = await render(<Harness browseAnchor={null} />);
		expect(takeover).not.toHaveBeenCalled();
		await rendered.rerender(<Harness browseAnchor={420} />);
		expect(takeover).toHaveBeenCalledWith(420);
	});

	it("takes the mini over when the reader moves on its own", async () => {
		rendered = await render(<Harness browseAnchor={null} />);
		act(() => navigateEmitter.emit(77, "jump"));
		expect(takeover).toHaveBeenCalledWith(77);
	});

	it("takes the mini over on the reader's own scroll settle and on a jump while reconciling", async () => {
		rendered = await render(<Harness browseAnchor={null} />);
		act(() => navigateEmitter.emit(12, "settle"));
		expect(takeover).toHaveBeenLastCalledWith(12);
		isReconciling = true;
		act(() => navigateEmitter.emit(13, "jump"));
		expect(takeover).toHaveBeenLastCalledWith(13);
	});

	it("leaves the mini playing for its own saves", async () => {
		rendered = await render(<Harness browseAnchor={null} />);
		isMiniSave = true;
		act(() => navigateEmitter.emit(10, "rsvp"));
		expect(takeover).not.toHaveBeenCalled();
	});

	it("leaves the mini playing for a jump's scroll reconcile", async () => {
		rendered = await render(<Harness browseAnchor={null} />);
		isReconciling = true;
		act(() => navigateEmitter.emit(11, "settle"));
		expect(takeover).not.toHaveBeenCalled();
	});
});
