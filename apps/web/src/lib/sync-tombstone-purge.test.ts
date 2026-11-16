import { describe, expect, test } from "vitest";
import { TombstoneScopeSchema } from "./sync-tombstone-purge";

describe("TombstoneScopeSchema", () => {
	test("accepts no user, for everyone, and one user id", () => {
		expect(TombstoneScopeSchema.parse({})).toEqual({});
		expect(TombstoneScopeSchema.parse({ userId: "u1" })).toEqual({ userId: "u1" });
	});

	test("rejects an empty user id instead of purging everyone", () => {
		expect(() => TombstoneScopeSchema.parse({ userId: "" })).toThrow();
	});
});
