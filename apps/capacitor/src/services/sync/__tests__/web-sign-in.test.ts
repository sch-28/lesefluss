import { describe, expect, it } from "vitest";
import { webSignInHref } from "../web-sign-in";

describe("webSignInHref", () => {
	it("sends the user back to where they started in the app", () => {
		const href = new URL(webSignInHref("/app/tabs/settings/sync?tab=a&b=1"), "https://x.test");
		expect(href.pathname).toBe("/login");
		expect(href.searchParams.get("redirect")).toBe("/app/tabs/settings/sync?tab=a&b=1");
	});
});
