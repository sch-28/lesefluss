import { describe, expect, it } from "vitest";
import { drawShareCard, isLocalImage, type ShareCardData } from "../render";

type Call = { name: string; args: unknown[] };

/** A 2D context that records what is drawn; `filter` is left out to stand for a WebView without it. */
function recordingCtx({ hasFilter }: { hasFilter: boolean }) {
	const calls: Call[] = [];
	const filters: string[] = [];
	const gradient = { addColorStop: () => {} };
	const target: Record<string, unknown> = {
		measureText: (text: string) => ({ width: text.length * 20 }),
		createLinearGradient: () => gradient,
	};
	if (hasFilter) target.filter = "none";
	const ctx = new Proxy(target, {
		get(obj, key: string) {
			if (key in obj) return obj[key];
			return (...args: unknown[]) => calls.push({ name: key, args });
		},
		set(obj, key: string, value) {
			if (key === "filter") filters.push(value);
			obj[key] = value;
			return true;
		},
	});
	const texts = () => calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0]));
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, filters, texts };
}

const cover = { naturalWidth: 400, naturalHeight: 600 } as unknown as CanvasImageSource;

const finished: ShareCardData = {
	kind: "book",
	kicker: "Finished · Nov 2026",
	title: "Morning Star",
	author: "Pierce Brown",
	cover: "data:image/png;base64,AA",
	tiles: [
		{ label: "Time", value: "11h 20m" },
		{ label: "wpm", value: "262" },
		{ label: "Days", value: "18" },
		{ label: "Words", value: "176k" },
	],
	handle: "jan",
};

describe("drawShareCard", () => {
	it("draws the cover, the title and every stat, with the handle", () => {
		const r = recordingCtx({ hasFilter: true });
		drawShareCard(r.ctx, finished, { format: "story", showHandle: true }, { cover, covers: [] });
		const texts = r.texts();
		expect(texts).toEqual(
			expect.arrayContaining(["FINISHED · NOV 2026", "Morning Star", "Pierce Brown"]),
		);
		expect(texts).toEqual(expect.arrayContaining(["11h 20m", "262", "18", "176k", "TIME", "WPM"]));
		expect(texts).toContain("@jan");
		// Backdrop and the cover itself.
		expect(r.calls.filter((c) => c.name === "drawImage")).toHaveLength(2);
		expect(r.filters.some((f) => f.startsWith("blur("))).toBe(true);
	});

	it("leaves the handle off when the reader hides it", () => {
		const r = recordingCtx({ hasFilter: true });
		drawShareCard(r.ctx, finished, { format: "square", showHandle: false }, { cover, covers: [] });
		expect(r.texts()).not.toContain("@jan");
		expect(r.texts()).toContain("lesefluss");
	});

	it("darkens an unblurred cover where the canvas has no filter", () => {
		const r = recordingCtx({ hasFilter: false });
		drawShareCard(r.ctx, finished, { format: "story", showHandle: true }, { cover, covers: [] });
		expect(r.filters).toEqual([]);
		expect(r.calls.filter((c) => c.name === "drawImage")).toHaveLength(2);
	});

	it("draws a generated cover with the title when there is no cover art", () => {
		const r = recordingCtx({ hasFilter: true });
		drawShareCard(
			r.ctx,
			finished,
			{ format: "story", showHandle: true },
			{ cover: null, covers: [] },
		);
		expect(r.calls.some((c) => c.name === "drawImage")).toBe(false);
		// Once on the generated cover, once under it.
		expect(r.texts().filter((t) => t === "Morning Star").length).toBeGreaterThanOrEqual(2);
	});

	it("draws a speed card's hero, trend and tiles over a wall of covers", () => {
		const r = recordingCtx({ hasFilter: true });
		const speed: ShareCardData = {
			kind: "speed",
			kicker: "Reading speed · 2026",
			covers: [],
			heroes: [{ label: "wpm", value: "262", delta: "+31" }],
			trend: [230, 241, 250, 262],
			tiles: [
				{ label: "Read", value: "21h" },
				{ label: "Books", value: "7" },
				{ label: "Words", value: "312k" },
			],
			handle: null,
		};
		drawShareCard(
			r.ctx,
			speed,
			{ format: "story", showHandle: true },
			{ cover: null, covers: [cover, cover] },
		);
		expect(r.texts()).toEqual(
			expect.arrayContaining(["262", "+31", "21h", "7", "312k", "READING SPEED · 2026"]),
		);
		expect(r.calls.filter((c) => c.name === "drawImage").length).toBeGreaterThan(10);
	});
});

describe("isLocalImage", () => {
	it("only lets data and blob images onto the canvas", () => {
		expect(isLocalImage("data:image/jpeg;base64,AA")).toBe(true);
		expect(isLocalImage("blob:https://app/1")).toBe(true);
		expect(isLocalImage("https://covers.example/1.jpg")).toBe(false);
		expect(isLocalImage(null)).toBe(false);
	});
});
