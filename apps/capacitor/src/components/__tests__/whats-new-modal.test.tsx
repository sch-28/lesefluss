import { type ChangelogEntry, changelog } from "@lesefluss/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../test/render";
import WhatsNewModal, { SHOW_WHATS_NEW_EVENT } from "../whats-new-modal";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	mutate: vi.fn(),
	isWide: true,
	settings: { onboardingCompleted: true, lastSeenChangelogDate: "2026-11-01" },
	lastReadBookId: "book-1" as string | null,
}));

vi.mock("@lesefluss/core", async (importOriginal) => {
	const entry = (title: string, date: string, extra: Partial<ChangelogEntry> = {}) => ({
		title,
		date,
		tags: ["App"],
		changes: [`${title} one`, `${title} two`],
		...extra,
	});
	return {
		...(await importOriginal<typeof import("@lesefluss/core")>()),
		changelog: [
			entry("Library tile", "2026-11-15", {
				highlight: true,
				icon: "library-big",
				link: "/tabs/library",
			}),
			entry("Speed tile", "2026-11-15", {
				highlight: true,
				icon: "gauge",
				link: "/tabs/stats?tab=speed",
			}),
			entry("RSVP tile", "2026-11-15", { highlight: true, icon: "volume-2", link: "rsvp" }),
			entry("Same day one", "2026-11-15", { icon: "monitor" }),
			entry("Same day two", "2026-11-15"),
			entry("Same day three", "2026-11-15", { icon: "check" }),
			entry("Website only", "2026-11-15", { tags: ["Website"] }),
			entry("Older release", "2026-10-29"),
		],
	};
});
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("../../hooks/use-media-query", () => ({ useMediaQuery: () => mocks.isWide }));
vi.mock("../../services/db/hooks", () => ({
	queryHooks: {
		useSettings: () => ({ data: mocks.settings }),
		useSaveSettings: () => ({ mutate: mocks.mutate, isPending: false }),
		useLastReadBookId: () => ({ data: mocks.lastReadBookId }),
	},
}));

const NEWEST = changelog[0]?.date;
const appChanges = changelog.filter((e) => e.tags.includes("App")).flatMap((e) => e.changes);
const originalScrollIntoView = Element.prototype.scrollIntoView;

let view: Rendered | null = null;
beforeEach(() => {
	mocks.isWide = true;
	mocks.settings = { onboardingCompleted: true, lastSeenChangelogDate: "2026-11-01" };
	mocks.lastReadBookId = "book-1";
});
afterEach(() => {
	view?.unmount();
	view = null;
	Element.prototype.scrollIntoView = originalScrollIntoView;
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

const popup = () => document.querySelector<HTMLElement>("[data-testid=whats-new]");
const tileTitles = () =>
	[...document.querySelectorAll("[data-testid=whats-new-tile] h3")].map((h) => h.textContent);
const button = (name: string | RegExp) => {
	const found = [...(popup()?.querySelectorAll("button") ?? [])].find((b) => {
		const label = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
		return typeof name === "string" ? label === name : name.test(label);
	});
	if (!found) throw new Error(`No button ${String(name)}`);
	return found;
};

describe("WhatsNewModal", () => {
	it("shows the release's highlights as tiles and the rest collapsed under Also new", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		view = await render(<WhatsNewModal />);
		expect(tileTitles()).toEqual(["Library tile", "Speed tile", "RSVP tile"]);
		const alsoNew = button(/^Also new/);
		expect(alsoNew.getAttribute("aria-expanded")).toBe("false");
		expect(alsoNew.textContent).toContain("3 more");
		expect(document.querySelector("[data-testid=whats-new-also-new]")).toBeNull();

		const scrolled = vi.fn();
		Element.prototype.scrollIntoView = scrolled;
		await click(alsoNew);
		expect(alsoNew.getAttribute("aria-expanded")).toBe("true");
		expect(scrolled).toHaveBeenCalled();
		const list = document.querySelector("[data-testid=whats-new-also-new]")?.textContent ?? "";
		expect(list).toContain("Same day one");
		expect(list).toContain("Same day three");
		expect(list).not.toContain("Website only");
		expect(errors.mock.calls.flat().join(" ")).not.toContain("same key");
	});

	it("Show me closes the popup, marks it seen and opens the feature", async () => {
		view = await render(<WhatsNewModal />);
		await click(button("Show me: Speed tile"));
		await flush();
		expect(popup()).toBeNull();
		expect(mocks.mutate).toHaveBeenCalledWith({ lastSeenChangelogDate: NEWEST });
		expect(mocks.navigate).toHaveBeenCalledWith({ href: "/tabs/stats?tab=speed" });
	});

	it("Show me on RSVP opens the last book in RSVP, or the library with none", async () => {
		view = await render(<WhatsNewModal />);
		await click(button("Show me: RSVP tile"));
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/tabs/reader/$id",
			params: { id: "book-1" },
			search: { mode: "rsvp" },
		});
		view.unmount();

		mocks.lastReadBookId = null;
		view = await render(<WhatsNewModal />);
		await click(button("Show me: RSVP tile"));
		expect(mocks.navigate).toHaveBeenLastCalledWith({ to: "/tabs/library" });
	});

	it("Got it marks the changelog seen", async () => {
		view = await render(<WhatsNewModal />);
		await click(button("Got it"));
		expect(mocks.mutate).toHaveBeenCalledWith({ lastSeenChangelogDate: NEWEST });
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("opened from Settings, lists the full changelog as plain lists without tiles", async () => {
		mocks.settings = { onboardingCompleted: true, lastSeenChangelogDate: NEWEST ?? "" };
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		view = await render(<WhatsNewModal />);
		expect(popup()).toBeNull();

		await act(async () => {
			window.dispatchEvent(new Event(SHOW_WHATS_NEW_EVENT));
		});
		await flush();
		expect(tileTitles()).toEqual([]);
		const text = popup()?.textContent ?? "";
		expect(text).toContain("Changelog");
		expect(text).toContain("Older release");
		expect(popup()?.querySelectorAll("ul li").length).toBe(appChanges.length);
		expect(errors.mock.calls.flat().join(" ")).not.toContain("same key");
		expect(button("Close")).toBeTruthy();
	});

	it("Full changelog switches the popup to the full list", async () => {
		view = await render(<WhatsNewModal />);
		await click(button("Full changelog"));
		expect(tileTitles()).toEqual([]);
		expect(popup()?.textContent).toContain("Older release");
	});

	it("is a bottom sheet on a phone", async () => {
		mocks.isWide = false;
		view = await render(<WhatsNewModal />);
		expect(popup()?.getAttribute("data-vaul-drawer")).not.toBeNull();
		expect(tileTitles()).toHaveLength(3);
	});
});
