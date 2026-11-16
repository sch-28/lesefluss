import { describe, expect, it } from "vitest";
import { libraryNotice } from "../library-notice";

const web = {
	isSubPage: false,
	isWebBuild: true,
	isWeb: true,
	isLoggedIn: false,
	isLocalNoticeDismissed: false,
};

describe("libraryNotice", () => {
	it("shows only the local-storage warning to a signed-out web reader", () => {
		expect(libraryNotice(web)).toBe("local-storage");
	});

	it("falls back to the web-limits line once signed in or dismissed", () => {
		expect(libraryNotice({ ...web, isLoggedIn: true })).toBe("web-limits");
		expect(libraryNotice({ ...web, isLocalNoticeDismissed: true })).toBe("web-limits");
	});

	it("shows nothing on a collection or shelf sub-page, or in the app", () => {
		expect(libraryNotice({ ...web, isSubPage: true })).toBeNull();
		expect(libraryNotice({ ...web, isWebBuild: false, isWeb: false })).toBeNull();
	});
});
