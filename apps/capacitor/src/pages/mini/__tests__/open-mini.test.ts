import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

const { closeMini, currentMiniSession, openMini } = await import("../open-mini");

function fakePopup() {
	return { closed: false, close: vi.fn() } as unknown as Window & { closed: boolean };
}

afterEach(() => {
	closeMini();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("popup Quick RSVP session", () => {
	it("ends when the popup is gone without saying so", async () => {
		vi.useFakeTimers();
		const popup = fakePopup();
		vi.spyOn(window, "open").mockReturnValue(popup);
		expect(await openMini("book-1")).toBe(true);
		expect(currentMiniSession()?.host).toBe("popup");

		vi.advanceTimersByTime(3000);
		expect(currentMiniSession(), "a live popup keeps its session").not.toBeNull();

		popup.closed = true;
		vi.advanceTimersByTime(1000);
		expect(currentMiniSession()).toBeNull();
	});

	it("leaves a newer session alone when an older popup closes", async () => {
		vi.useFakeTimers();
		const first = fakePopup();
		const second = fakePopup();
		vi.spyOn(window, "open").mockReturnValueOnce(first).mockReturnValueOnce(second);
		await openMini("book-1");
		await openMini("book-1");
		const session = currentMiniSession();

		first.closed = true;
		vi.advanceTimersByTime(2000);
		expect(currentMiniSession()).toBe(session);
	});
});
