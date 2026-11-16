import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";
import { UNDO_WINDOW_MS, useUndoableDelete } from "../use-undoable-delete";

let view: Rendered | undefined;
let api: ReturnType<typeof useUndoableDelete> | undefined;
const commit = vi.fn(async (_ids: string[]) => {});

function Probe() {
	api = useUndoableDelete(commit);
	return <span>{[...api.hidden].join(",")}</span>;
}

beforeEach(async () => {
	vi.useFakeTimers();
	commit.mockReset().mockResolvedValue(undefined);
	view = await render(<Probe />);
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

describe("useUndoableDelete", () => {
	it("hides the rows at once and deletes them when the window closes", async () => {
		await act(async () => {
			api?.deleteLater(["a", "b"]);
		});
		expect(view?.text()).toBe("a,b");
		expect(commit).not.toHaveBeenCalled();
		await act(async () => {
			vi.advanceTimersByTime(UNDO_WINDOW_MS);
		});
		expect(commit).toHaveBeenCalledWith(["a", "b"]);
		expect(view?.text()).toBe("a,b");
	});

	it("deletes nothing after Undo, and shows the rows again", async () => {
		let undo = () => {};
		await act(async () => {
			undo = api?.deleteLater(["a"]) ?? undo;
		});
		await act(async () => {
			undo();
			vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
		});
		expect(commit).not.toHaveBeenCalled();
		expect(view?.text()).toBe("");
	});

	it("shows the rows again when the delete fails", async () => {
		commit.mockRejectedValue(new Error("offline"));
		await act(async () => {
			api?.deleteNow(["a"]);
		});
		expect(commit).toHaveBeenCalledWith(["a"]);
		expect(view?.text()).toBe("");
	});

	it("still deletes a pending row when the page goes away", async () => {
		await act(async () => {
			api?.deleteLater(["a"]);
		});
		view?.unmount();
		view = undefined;
		expect(commit).toHaveBeenCalledWith(["a"]);
	});
});
