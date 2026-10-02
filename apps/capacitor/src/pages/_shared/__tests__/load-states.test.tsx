import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render, setOnline } from "../../../test/render";
import { NetworkError } from "../../../utils/network-error";
import { describeLoadError, ErrorState } from "../load-states";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	setOnline(true);
});

describe("describeLoadError", () => {
	it("calls it offline whenever the device is offline", () => {
		expect(describeLoadError(new Error("HTTP 500"), false)).toBe("offline");
	});

	it("calls a fetch that never reached the server a network error", () => {
		expect(describeLoadError(new TypeError("Failed to fetch"), true)).toBe("network");
		expect(describeLoadError(new NetworkError(), true)).toBe("network");
	});

	it("calls anything else a server error", () => {
		expect(describeLoadError(new Error("Search failed (500)"), true)).toBe("server");
		expect(describeLoadError(undefined, true)).toBe("server");
	});
});

describe("ErrorState", () => {
	it("offers a Retry that calls back", async () => {
		const onRetry = vi.fn();
		view = await render(<ErrorState error={new Error("boom")} onRetry={onRetry} />);
		await click(view.getButton("Retry"));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("shows an offline message instead of the raw fetch error", async () => {
		setOnline(false);
		view = await render(<ErrorState error={new TypeError("Failed to fetch")} onRetry={vi.fn()} />);
		expect(view.text()).toContain("You're offline");
		expect(view.text()).not.toContain("Failed to fetch");
		expect(view.queryButton("Retry")).not.toBeNull();
	});

	it("switches to the offline message when the connection drops", async () => {
		view = await render(<ErrorState error={new Error("Search failed (500)")} />);
		expect(view.text()).toContain("Something went wrong");
		setOnline(false);
		expect(view.text()).toContain("You're offline");
	});

	it("never echoes a server error message", async () => {
		view = await render(<ErrorState error={new Error("Search failed (500)")} />);
		expect(view.text()).not.toContain("500");
	});

	it("uses the caller's message for server errors only", async () => {
		view = await render(<ErrorState error={new Error("x")} message="Some providers failed." />);
		expect(view.text()).toContain("Some providers failed.");
	});

	it("renders a source link when given one", async () => {
		view = await render(
			<ErrorState error={new Error("x")} sourceLink={{ href: "https://a.test", label: "Open" }} />,
		);
		expect(view.container.querySelector("a")?.getAttribute("href")).toBe("https://a.test");
	});
});
