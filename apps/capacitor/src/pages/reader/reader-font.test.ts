import { afterEach, describe, expect, it, vi } from "vitest";
import { hasLoadedFace, loadReaderFont } from "./reader-font";

const realFonts = Object.getOwnPropertyDescriptor(document, "fonts");

function stubFonts(load: (font: string) => Promise<unknown>) {
	Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
}

afterEach(() => {
	vi.useRealTimers();
	if (realFonts) Object.defineProperty(document, "fonts", realFonts);
	else Reflect.deleteProperty(document, "fonts");
});

describe("loadReaderFont", () => {
	it("loads the bundled face in both weights the reader shows", async () => {
		const load = vi.fn(async (_font: string) => []);
		stubFonts(load);

		await loadReaderFont("literata");

		expect(load.mock.calls.map(([font]) => font)).toEqual([
			'400 1em "Literata"',
			'700 1em "Literata"',
		]);
	});

	it("loads nothing for a system font", async () => {
		const load = vi.fn(async () => []);
		stubFonts(load);

		await loadReaderFont("serif");

		expect(load).not.toHaveBeenCalled();
	});

	it("waits for a slow face up to the timeout, then gives up so the reader still opens", async () => {
		vi.useFakeTimers();
		stubFonts(() => new Promise(() => {}));
		let isDone = false;

		void loadReaderFont("opendyslexic").then(() => {
			isDone = true;
		});
		await vi.advanceTimersByTimeAsync(2999);
		expect(isDone).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect(isDone).toBe(true);
	});

	it("opens in the fallback when the face fails to load", async () => {
		stubFonts(() => Promise.reject(new Error("offline")));

		await expect(loadReaderFont("atkinson")).resolves.toBeUndefined();
	});
});

describe("hasLoadedFace", () => {
	const loaded = (...families: string[]) =>
		Object.assign(new Event("loadingdone"), { fontfaces: families.map((family) => ({ family })) });

	it("matches the reader's face, quoted or not", () => {
		expect(hasLoadedFace(loaded('"OpenDyslexic"'), "OpenDyslexic")).toBe(true);
		expect(hasLoadedFace(loaded("Atkinson Hyperlegible"), "Atkinson Hyperlegible")).toBe(true);
	});

	it("ignores other faces", () => {
		expect(hasLoadedFace(loaded("Literata", "Geist Variable"), "OpenDyslexic")).toBe(false);
		expect(hasLoadedFace(new Event("loadingdone"), "OpenDyslexic")).toBe(false);
	});
});
