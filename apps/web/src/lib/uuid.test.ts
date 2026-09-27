import { describe, expect, test } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
	test("accepts canonical UUIDs in either case", () => {
		expect(isUuid("831ed337-965a-499a-9228-27a787aa0580")).toBe(true);
		expect(isUuid("831ED337-965A-499A-9228-27A787AA0580")).toBe(true);
	});

	test("rejects anything else of the same length", () => {
		expect(isUuid("-".repeat(36))).toBe(false);
		expect(isUuid("831ed337965a-499a-9228-27a787aa0580-")).toBe(false);
		expect(isUuid("831ed337-965a-499a-9228-27a787aa058g")).toBe(false);
		expect(isUuid("")).toBe(false);
	});
});
