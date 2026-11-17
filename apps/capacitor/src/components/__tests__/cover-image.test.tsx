import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render, setOnline } from "../../test/render";
import CoverImage from "../cover-image";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	setOnline(true);
});

describe("CoverImage", () => {
	it("tries a failed cover again once the device is back online", async () => {
		view = await render(
			<CoverImage src="data:image/png;base64,broken" alt="" fallback={<span>FALLBACK</span>} />,
		);
		const img = view.container.querySelector("img") as HTMLImageElement;
		act(() => {
			img.dispatchEvent(new Event("error"));
		});
		expect(view.container.querySelector("img")).toBeNull();
		expect(view.text()).toContain("FALLBACK");

		setOnline(false);
		setOnline(true);
		expect(view.container.querySelector("img")).not.toBeNull();
	});
});

describe("CoverImage default fallback", () => {
	it("shows a titleless tinted cover when there is no cover", async () => {
		view = await render(<CoverImage src={null} alt="Dune" />);
		const cover = view.container.querySelector('[data-testid="tinted-cover"]');
		expect(cover).not.toBeNull();
		expect(cover?.textContent).toBe("");
	});

	it("keeps the BOOK stub when the image is decorative", async () => {
		view = await render(<CoverImage src={null} alt="" />);
		expect(view.container.querySelector('[data-testid="tinted-cover"]')).toBeNull();
		expect(view.text()).toBe("BOOK");
	});
});
