import { describe, expect, it } from "vitest";
import { isEinkManufacturer } from "../index";

describe("isEinkManufacturer", () => {
	it("recognises e-reader makers whatever the casing", () => {
		expect(isEinkManufacturer({ manufacturer: "ONYX", brand: "ONYX" })).toBe(true);
		expect(isEinkManufacturer({ manufacturer: "Onyx", brand: "boox" })).toBe(true);
		expect(isEinkManufacturer({ manufacturer: "Bigme", brand: "Bigme" })).toBe(true);
		expect(isEinkManufacturer({ manufacturer: "MEEBOOK", brand: "Meebook" })).toBe(true);
	});

	it("matches on the brand when the manufacturer is a generic ODM", () => {
		expect(isEinkManufacturer({ manufacturer: "rockchip", brand: "Likebook" })).toBe(true);
		expect(isEinkManufacturer({ manufacturer: "Allwinner", brand: "PocketBook" })).toBe(true);
	});

	it("leaves phones and tablets alone", () => {
		expect(isEinkManufacturer({ manufacturer: "Google", brand: "google" })).toBe(false);
		expect(isEinkManufacturer({ manufacturer: "samsung", brand: "samsung" })).toBe(false);
		expect(isEinkManufacturer({ manufacturer: "Xiaomi", brand: "Redmi" })).toBe(false);
		expect(isEinkManufacturer({ manufacturer: "Amazon", brand: "Amazon" })).toBe(false);
		expect(isEinkManufacturer({ manufacturer: "", brand: "" })).toBe(false);
	});
});
