import { describe, expect, it } from "vitest";
import { missingImageKeys } from "../repair-images";

describe("missingImageKeys", () => {
	it("lists each anchored key without a stored row once", () => {
		const anchors = [
			{ word: 0, key: "/i/map.png", alt: "" },
			{ word: 3, key: "/i/orn.png", alt: "" },
			{ word: 9, key: "/i/orn.png", alt: "" },
			{ word: 12, key: "/i/plate.jpg", alt: "" },
		];
		expect(missingImageKeys(anchors, ["/i/map.png"])).toEqual(["/i/orn.png", "/i/plate.jpg"]);
	});

	it("is empty when every anchor has its row or there are no anchors", () => {
		expect(missingImageKeys([{ word: 0, key: "/i/a.png", alt: "" }], ["/i/a.png"])).toEqual([]);
		expect(missingImageKeys([], [])).toEqual([]);
	});
});
