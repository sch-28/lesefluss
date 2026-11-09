import { describe, expect, it } from "vitest";
import { resolveBack } from "../resolve-back";

describe("resolveBack", () => {
	it.each([
		["/tabs/library", "", true, { kind: "exit" }],
		["/tabs/library/", "", true, { kind: "exit" }],
		["/", "", false, { kind: "exit" }],
		["/tabs/library", "?f=abc", true, { kind: "exit" }],
		["/tabs/library", "?collection=c1", true, { kind: "back" }],
		["/tabs/library", "?collection=c1", false, { kind: "replace", to: "/tabs/library" }],
		["/tabs/library", "?shelf=s1", true, { kind: "back" }],
		["/tabs/stats", "", true, { kind: "replace", to: "/tabs/library" }],
		["/tabs/stats", "?tab=sessions", true, { kind: "replace", to: "/tabs/stats" }],
		["/tabs/stats", "?tab=speed", false, { kind: "replace", to: "/tabs/stats" }],
		["/tabs/explore", "", true, { kind: "replace", to: "/tabs/library" }],
		["/tabs/social", "", false, { kind: "replace", to: "/tabs/library" }],
		["/tabs/settings", "", true, { kind: "replace", to: "/tabs/library" }],
		["/tabs/settings/licenses", "", true, { kind: "back" }],
		["/tabs/settings/licenses", "", false, { kind: "replace", to: "/tabs/settings" }],
		["/tabs/library/book/b1", "", false, { kind: "replace", to: "/tabs/library" }],
		["/tabs/social/inbox", "", false, { kind: "replace", to: "/tabs/social" }],
		["/tabs/reader/b1", "", true, { kind: "back" }],
		["/tabs/reader/b1", "", false, { kind: "replace", to: "/tabs/library" }],
		["/onboarding", "", false, { kind: "exit" }],
	] as const)("%s%s (history: %s)", (pathname, search, canGoBack, expected) => {
		expect(resolveBack(pathname, search, canGoBack)).toEqual(expected);
	});
});
