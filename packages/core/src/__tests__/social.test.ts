import { describe, expect, it } from "vitest";
import {
	ClaimHandleBodySchema,
	initialsFor,
	normalizeHandle,
	UpdateSocialProfileBodySchema,
	validateBio,
	validateDisplayName,
	validateHandle,
} from "../social";

describe("validateHandle", () => {
	it("accepts letters, digits and underscores between 3 and 20 characters", () => {
		expect(validateHandle("abc")).toEqual({ ok: true });
		expect(validateHandle("Jan_Schmidt_2026")).toEqual({ ok: true });
		expect(validateHandle("a".repeat(20))).toEqual({ ok: true });
	});

	it("rejects lengths outside the range", () => {
		expect(validateHandle("ab")).toEqual({ ok: false, reason: "too_short" });
		expect(validateHandle("a".repeat(21))).toEqual({ ok: false, reason: "too_long" });
	});

	it("rejects characters outside [A-Za-z0-9_]", () => {
		expect(validateHandle("jan-schmidt")).toEqual({ ok: false, reason: "invalid_chars" });
		expect(validateHandle("jan schmidt")).toEqual({ ok: false, reason: "invalid_chars" });
		expect(validateHandle("jän")).toEqual({ ok: false, reason: "invalid_chars" });
	});

	// "K".toLowerCase() is "k": a pre-check on the lowercased value would let two
	// different raw strings collapse into one handle.
	it("rejects Unicode that lowercases into ASCII", () => {
		expect("K".toLowerCase()).toBe("k");
		expect(validateHandle("Kelvin")).toEqual({ ok: false, reason: "invalid_chars" });
		expect(validateHandle("ａbc")).toEqual({ ok: false, reason: "invalid_chars" });
	});

	it("normalises to lowercase", () => {
		expect(normalizeHandle("JanSchmidt")).toBe("janschmidt");
	});
});

describe("validateDisplayName", () => {
	it("accepts 1 to 50 characters", () => {
		expect(validateDisplayName("J")).toEqual({ ok: true });
		expect(validateDisplayName("Jan Schmidt")).toEqual({ ok: true });
		expect(validateDisplayName("é".repeat(50))).toEqual({ ok: true });
	});

	it("rejects empty and overlong names", () => {
		expect(validateDisplayName("")).toEqual({ ok: false, reason: "too_short" });
		expect(validateDisplayName("a".repeat(51))).toEqual({ ok: false, reason: "too_long" });
	});

	it("rejects control and bidirectional override characters", () => {
		expect(validateDisplayName("Jan\u0000")).toEqual({ ok: false, reason: "control_chars" });
		expect(validateDisplayName("Jan\nSchmidt")).toEqual({ ok: false, reason: "control_chars" });
		expect(validateDisplayName("‮gnp.exe")).toEqual({ ok: false, reason: "control_chars" });
		expect(validateDisplayName("a⁦b")).toEqual({ ok: false, reason: "control_chars" });
		expect(validateDisplayName("a‏b")).toEqual({ ok: false, reason: "control_chars" });
	});
});

describe("validateBio", () => {
	it("accepts empty and up to 160 characters", () => {
		expect(validateBio("")).toEqual({ ok: true });
		expect(validateBio("x".repeat(160))).toEqual({ ok: true });
	});

	it("rejects overlong and control characters", () => {
		expect(validateBio("x".repeat(161))).toEqual({ ok: false, reason: "too_long" });
		expect(validateBio("line\u000Bbreak")).toEqual({ ok: false, reason: "control_chars" });
	});
});

describe("body schemas", () => {
	it("trims the display name before validating", () => {
		const parsed = ClaimHandleBodySchema.parse({ handle: "jan", name: "  Jan  " });
		expect(parsed.name).toBe("Jan");
	});

	it("rejects an unknown visibility", () => {
		expect(UpdateSocialProfileBodySchema.safeParse({ visibility: "public" }).success).toBe(false);
		expect(UpdateSocialProfileBodySchema.safeParse({ visibility: "friends" }).success).toBe(true);
	});
});

describe("initialsFor", () => {
	it("uses the first and last word", () => {
		expect(initialsFor("Jan Schmidt")).toBe("JS");
		expect(initialsFor("jan")).toBe("J");
		expect(initialsFor("  ")).toBe("?");
	});
});
