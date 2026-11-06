import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const SRC = "data:image/png;base64,iVBORw0KGgo=";
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: { useBookImageData: () => ({ data: SRC }) },
}));

const { default: ReaderFigure } = await import("../reader-figure");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("ReaderFigure", () => {
	it("renders an undraggable image with no word spans", async () => {
		view = await render(
			<ReaderFigure
				figure={{
					id: 0,
					bookId: "b",
					key: "k",
					alt: "Plate 1",
					width: 400,
					height: 300,
					isLineArt: false,
				}}
			/>,
		);
		const img = document.querySelector("figure.reader-figure img") as HTMLImageElement;
		// A draggable img under a long-press wedges WebView 148's touch dispatch.
		expect(img.getAttribute("draggable")).toBe("false");
		expect(img.getAttribute("src")).toBe(SRC);
		expect(document.querySelector("figure [data-word]")).toBeNull();
	});
});
