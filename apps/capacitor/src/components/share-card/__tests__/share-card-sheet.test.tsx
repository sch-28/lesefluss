import type React from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareCardData } from "../../../services/share-card/render";
import { click, flush, type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({
	handle: "jan" as string | null,
	render: vi.fn(),
	share: vi.fn(),
}));

vi.mock("../use-share-handle", () => ({ useShareHandle: () => state.handle }));
vi.mock("../../../services/share-card/render", () => ({ renderShareCard: state.render }));
vi.mock("../../../services/share-card/share", () => ({ shareCardImage: state.share }));
vi.mock("../../toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lesefluss/ui/drawer", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Drawer: (p: {
			open: boolean;
			children: React.ReactNode;
			onAnimationEnd?: (open: boolean) => void;
		}) => {
			useEffect(() => {
				if (!p.open) p.onAnimationEnd?.(false);
			}, [p.open, p.onAnimationEnd]);
			return p.open ? <div data-testid="sheet">{p.children}</div> : null;
		},
		DrawerContent: Pass,
		DrawerTitle: Pass,
		DrawerDescription: Pass,
		DrawerFooter: Pass,
	};
});

const { ShareCardSheet } = await import("../share-card-sheet");

const card: ShareCardData = {
	kind: "book",
	kicker: "Finished · Nov 2026",
	title: "Morning Star",
	author: "Pierce Brown",
	cover: null,
	tiles: [{ label: "wpm", value: "262" }],
	handle: null,
};
const blob = new Blob(["png"], { type: "image/png" });
const onClose = vi.fn();

let view: Rendered | undefined;
beforeEach(() => {
	state.handle = "jan";
	state.render.mockReset().mockResolvedValue(blob);
	state.share.mockReset().mockResolvedValue("shared");
	onClose.mockReset();
	URL.createObjectURL = vi.fn(() => "blob:card");
	URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function open() {
	view = await render(
		<ShareCardSheet card={card} onClose={onClose} filename="lesefluss-finished" />,
	);
	await flush();
	return view;
}

const lastRender = () => state.render.mock.calls.at(-1) as [ShareCardData, object];

describe("ShareCardSheet", () => {
	it("draws a story card with the reader's handle and hands it to the share sheet", async () => {
		const v = await open();
		expect(lastRender()).toEqual([
			{ ...card, handle: "jan" },
			{ format: "story", showHandle: true },
		]);
		expect(v.container.querySelector("[data-testid=share-card-preview]")).not.toBeNull();
		await click(v.getButton("Share"));
		expect(state.share).toHaveBeenCalledWith(blob, "lesefluss-finished-story.png");
		expect(onClose).toHaveBeenCalled();
	});

	it("redraws as a square and without the handle once toggled off", async () => {
		const v = await open();
		expect(v.getButton("Square").closest('[data-slot="segmented-control"]')).not.toBeNull();
		await click(v.getButton("Square"));
		expect(lastRender()[1]).toEqual({ format: "square", showHandle: true });
		const toggle = v.container.querySelector<HTMLElement>("[aria-labelledby=share-card-handle]");
		if (!toggle) throw new Error("no handle toggle");
		await click(toggle);
		expect(lastRender()[1]).toEqual({ format: "square", showHandle: false });
		await click(v.getButton("Share"));
		expect(state.share).toHaveBeenCalledWith(blob, "lesefluss-finished-square.png");
	});

	it("offers no handle toggle to a reader without a handle", async () => {
		state.handle = null;
		const v = await open();
		expect(v.text()).not.toContain("Show @");
		expect(lastRender()[0].handle).toBeNull();
	});

	it("stays open when the share sheet is cancelled", async () => {
		state.share.mockResolvedValue("cancelled");
		const v = await open();
		await click(v.getButton("Share"));
		expect(onClose).not.toHaveBeenCalled();
		expect(v.container.querySelector("[data-testid=sheet]")).not.toBeNull();
	});
});
