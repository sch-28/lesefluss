import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			store.delete(key);
		}),
	},
}));

import { clearPendingLink, setPendingLink, takePendingLink } from "../pending-link";

const HOUR = 60 * 60_000;

describe("pending link", () => {
	beforeEach(() => store.clear());

	it("returns the stored link once", async () => {
		await setPendingLink({ kind: "invite", token: "abc" }, 1000);
		expect(await takePendingLink(2000)).toEqual({ kind: "invite", token: "abc" });
		expect(await takePendingLink(3000)).toBeNull();
	});

	it("keeps only the latest link", async () => {
		await setPendingLink({ kind: "invite", token: "first" }, 1000);
		await setPendingLink({ kind: "invite", token: "second" }, 2000);
		expect(await takePendingLink(3000)).toEqual({ kind: "invite", token: "second" });
	});

	it("drops a link older than 24 hours", async () => {
		await setPendingLink({ kind: "invite", token: "old" }, 0);
		expect(await takePendingLink(24 * HOUR + 1)).toBeNull();
		await setPendingLink({ kind: "invite", token: "fresh" }, 0);
		expect(await takePendingLink(24 * HOUR)).toEqual({ kind: "invite", token: "fresh" });
	});

	it("drops malformed entries and clears on demand", async () => {
		store.set("social_pending_link", "{not json");
		expect(await takePendingLink()).toBeNull();
		store.set("social_pending_link", JSON.stringify({ kind: "other", token: "x", storedAt: 1 }));
		expect(await takePendingLink()).toBeNull();
		await setPendingLink({ kind: "invite", token: "gone" });
		await clearPendingLink();
		expect(await takePendingLink()).toBeNull();
	});
});
