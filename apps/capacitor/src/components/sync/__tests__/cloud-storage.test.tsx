import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudStorage } from "../../../services/sync/cloud-storage";
import { type Rendered, render } from "../../../test/render";

const MIB = 1024 * 1024;
const storage: { current: CloudStorage | undefined } = { current: undefined };

vi.mock("../../../services/db/hooks/use-cloud-storage", () => ({
	useCloudStorage: () => ({ data: storage.current }),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<a href="/" className={className}>
			{children}
		</a>
	),
}));

const { CloudStorageSection } = await import("../cloud-storage");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const indicator = () =>
	view?.container.querySelector<HTMLElement>("[data-slot=progress-indicator]")?.className ?? "";

describe("CloudStorageSection", () => {
	it("renders nothing while usage is unknown", async () => {
		storage.current = { quota: null, notBackedUp: [] };
		view = await render(<CloudStorageSection />);
		expect(view.container.textContent).toBe("");
	});

	it("shows usage with a plain bar below 90%", async () => {
		storage.current = { quota: { usedBytes: 100 * MIB, quotaBytes: 500 * MIB }, notBackedUp: [] };
		view = await render(<CloudStorageSection />);
		expect(view.text()).toContain("100.0 MB of 500.0 MB used");
		expect(view.text()).toContain("20%");
		expect(indicator()).not.toMatch(/bg-amber-500|bg-destructive/);
		expect(view.container.querySelector("[role=progressbar]")?.getAttribute("aria-valuetext")).toBe(
			"100.0 MB of 500.0 MB used",
		);
	});

	it("turns amber from 90% and never rounds up to 100%", async () => {
		storage.current = { quota: { usedBytes: 499 * MIB, quotaBytes: 500 * MIB }, notBackedUp: [] };
		view = await render(<CloudStorageSection />);
		expect(view.text()).toContain("99%");
		expect(indicator()).toContain("bg-amber-500");
	});

	it("turns red and lists the books once one is refused", async () => {
		storage.current = {
			quota: { usedBytes: 400 * MIB, quotaBytes: 500 * MIB },
			notBackedUp: [{ id: "aaaaaaaa", title: "Dune" }],
		};
		view = await render(<CloudStorageSection />);
		expect(indicator()).toContain("bg-destructive");
		expect(view.text()).toContain("Not backed up (1)");
		expect(view.text()).toContain("Dune");
	});
});
