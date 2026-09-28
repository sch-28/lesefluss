import { describe, expect, test } from "vitest";
import { AuthedFetchError } from "../../authed-fetch";
import { isPermanentLiveError } from "../live";

const status = (s: number) => new AuthedFetchError(s, "", null);

describe("isPermanentLiveError", () => {
	test("gives up on answers a retry cannot change", () => {
		for (const s of [400, 401, 403, 404]) expect(isPermanentLiveError(status(s))).toBe(true);
	});

	test("keeps retrying on rate limits, server errors and network failures", () => {
		for (const s of [429, 500, 502, 503]) expect(isPermanentLiveError(status(s))).toBe(false);
		expect(isPermanentLiveError(new TypeError("Failed to fetch"))).toBe(false);
		expect(isPermanentLiveError(new Error("no stream body"))).toBe(false);
	});
});
