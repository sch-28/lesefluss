import { describe, expect, it } from "vitest";
import { enterTag } from "../cell-editors";

describe("enterTag", () => {
	it("does nothing on an empty box, so a second Enter adds no tag", () => {
		expect(enterTag("", ["Ancient", "Fantasy"])).toBeNull();
	});

	it("takes the exact tag typed even when another match sorts first", () => {
		expect(enterTag("fantasy", ["Dark Fantasy", "Fantasy"])).toBe("Fantasy");
	});

	it("creates the typed tag when none matches exactly", () => {
		expect(enterTag("Fan", ["Dark Fantasy", "Fantasy"])).toBe("Fan");
	});
});
