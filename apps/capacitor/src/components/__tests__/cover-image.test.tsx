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
