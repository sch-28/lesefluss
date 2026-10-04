import { describe, expect, it } from "vitest";
import { appInviteIntentUrl, PLAY_STORE_URL } from "./store-links";

describe("appInviteIntentUrl", () => {
	it("targets the app's claimed invite path and falls back to the Play Store", () => {
		const url = appInviteIntentUrl("abc_DEF-123");
		expect(url).toBe(
			`intent://lesefluss.app/invite/abc_DEF-123#Intent;scheme=https;package=app.lesefluss;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`,
		);
	});

	it("cannot break out of the intent with a crafted token", () => {
		expect(appInviteIntentUrl("x#Intent;package=evil;end")).not.toContain("package=evil");
	});
});
