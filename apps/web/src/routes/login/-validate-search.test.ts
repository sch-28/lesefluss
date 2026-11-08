import { describe, expect, test } from "vitest";
import { Route } from "./index";

const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => {
	redirect?: string;
};

describe("login validateSearch", () => {
	test("overwrites a rejected redirect, since the router merges the raw search under the result", () => {
		for (const redirect of ["/\\evil.example", "https://evil.example/", "/.//evil.example"]) {
			const result = validateSearch({ redirect });
			expect(result, redirect).toHaveProperty("redirect", undefined);
			expect({ redirect, ...result }.redirect, redirect).toBeUndefined();
		}
	});

	test("passes a same-origin redirect on as its normalised path", () => {
		expect(validateSearch({ redirect: "/invite/abc123" })).toEqual({ redirect: "/invite/abc123" });
		expect(validateSearch({ redirect: "/invite/../profile" })).toEqual({ redirect: "/profile" });
	});
});
