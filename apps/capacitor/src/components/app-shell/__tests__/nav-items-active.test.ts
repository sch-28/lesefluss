import { describe, expect, it, vi } from "vitest";

vi.mock("../../../contexts/sync-context", () => ({ useSyncContext: () => ({}) }));
vi.mock("../../../services/social/cache", () => ({ useRefetchSocialOnForeground: () => {} }));
vi.mock("../../../services/social/inbox", () => ({ useUnreadCount: () => ({}) }));
vi.mock("../../../services/sync", () => ({ SYNC_ENABLED: true }));

const { isSidebarListPage } = await import("../nav-items");

describe("isSidebarListPage", () => {
	it("hands the highlight to the sidebar row on a collection, shelf or series page", () => {
		expect(isSidebarListPage("/tabs/library", { collection: "c1" })).toBe(true);
		expect(isSidebarListPage("/tabs/library", { shelf: "s1" })).toBe(true);
		expect(isSidebarListPage("/tabs/library/series/wn", {})).toBe(true);
		expect(isSidebarListPage("/tabs/library/all-series", {})).toBe(true);
	});

	it("keeps it on Library for the library itself and its other pages", () => {
		expect(isSidebarListPage("/tabs/library", {})).toBe(false);
		expect(isSidebarListPage("/tabs/library/book/b1", {})).toBe(false);
		expect(isSidebarListPage("/tabs/stats", {})).toBe(false);
	});
});
