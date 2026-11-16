import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const custom = vi.hoisted(() => vi.fn());
const confirmTick = vi.hoisted(() => vi.fn());
vi.mock("@lesefluss/ui/sonner", () => ({
	toast: { custom, dismiss: vi.fn() },
	Toaster: () => null,
	useSonner: () => ({ toasts: [] }),
}));
vi.mock("../../services/haptics", () => ({ confirmTick }));

const { toast } = await import("../toast");

type Content = { kind: string; message: string; duration: number; version: number };

function lastCard(): { content: Content; options: { id?: string; duration: number } } {
	const [render, options] = custom.mock.calls.at(-1) ?? [];
	const element = (render as (id: string) => React.ReactElement<{ content: Content }>)("x");
	return { content: element.props.content, options };
}

afterEach(() => vi.clearAllMocks());

describe("toast", () => {
	it("gives each kind its time on screen", () => {
		toast.success("ok");
		expect(lastCard().content.duration).toBe(2500);
		toast.error("no");
		expect(lastCard().content.duration).toBe(4000);
		toast.success("gone", { action: { label: "Undo", onClick: () => {} } });
		expect(lastCard().content.duration).toBe(6000);
		toast.success("saved", { icon: "wishlist" });
		expect(lastCard().content).toMatchObject({ kind: "wishlist", duration: 2200 });
		toast.loading("adding", { id: "import:1" });
		expect(lastCard().content.duration).toBe(Number.POSITIVE_INFINITY);
	});

	it("leaves timing to the card, so sonner never closes a toast itself", () => {
		toast.info("hi", { id: "a" });
		expect(lastCard().options).toEqual({ id: "a", duration: Number.POSITIVE_INFINITY });
	});

	it("passes no id key without an id, so sonner's own id reaches the card", () => {
		toast.success("ok");
		expect(lastCard().options).not.toHaveProperty("id");
	});

	it("bumps the version so a replaced toast restarts its countdown", () => {
		toast.loading("adding", { id: "import:1" });
		const first = lastCard().content.version;
		toast.success("added", { id: "import:1" });
		expect(lastCard().content.version).toBeGreaterThan(first);
	});

	it("ticks for a success or a wishlist add, not for errors or loading", () => {
		toast.success("ok");
		toast.success("saved", { icon: "wishlist" });
		expect(confirmTick).toHaveBeenCalledTimes(2);
		toast.error("no");
		toast.warning("hm");
		toast.loading("adding", { id: "x" });
		expect(confirmTick).toHaveBeenCalledTimes(2);
	});
});
