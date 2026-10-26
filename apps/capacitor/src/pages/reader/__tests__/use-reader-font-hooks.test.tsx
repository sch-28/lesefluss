import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import type { ReaderFont } from "../reader-font";
import { useFontLoadCount } from "../use-font-load-count";
import { useLoadedReaderFont } from "../use-loaded-reader-font";

const realFonts = Object.getOwnPropertyDescriptor(document, "fonts");
let fonts: EventTarget & { load: (font: string) => Promise<unknown> };
const pending = new Map<string, () => void>();

beforeEach(() => {
	fonts = Object.assign(new EventTarget(), {
		load: (font: string) =>
			new Promise<unknown>((resolve) => {
				pending.set(font, () => resolve([]));
			}),
	});
	Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	pending.clear();
	if (realFonts) Object.defineProperty(document, "fonts", realFonts);
	else Reflect.deleteProperty(document, "fonts");
});

/** Resolves both weights of `face`, as the browser does once its files are in. */
async function finishLoading(face: string) {
	await act(async () => {
		for (const weight of [400, 700]) pending.get(`${weight} 1em "${face}"`)?.();
		await Promise.resolve();
	});
}

let shown: ReaderFont | null = null;
function FontProbe({ family }: { family: string }) {
	shown = useLoadedReaderFont(family, false);
	return null;
}

describe("useLoadedReaderFont", () => {
	it("has no font until the first one has loaded", async () => {
		view = await render(<FontProbe family="literata" />);
		expect(shown).toBeNull();

		await finishLoading("Literata");

		expect(shown).toEqual({ family: "literata", isBold: false });
	});

	it("keeps the old font until the new one has loaded", async () => {
		view = await render(<FontProbe family="literata" />);
		await finishLoading("Literata");

		await view.rerender(<FontProbe family="opendyslexic" />);
		expect(shown?.family).toBe("literata");
		await finishLoading("OpenDyslexic");

		expect(shown?.family).toBe("opendyslexic");
	});

	it("ignores a font picked over before it finished loading", async () => {
		view = await render(<FontProbe family="literata" />);
		await view.rerender(<FontProbe family="opendyslexic" />);
		await view.rerender(<FontProbe family="atkinson" />);

		await finishLoading("Atkinson Hyperlegible");
		await finishLoading("OpenDyslexic");
		await finishLoading("Literata");

		expect(shown?.family).toBe("atkinson");
	});
});

let count = 0;
function CountProbe({ face }: { face: string }) {
	count = useFontLoadCount(face);
	return null;
}

const loadingDone = (...families: string[]) =>
	act(() => {
		fonts.dispatchEvent(
			Object.assign(new Event("loadingdone"), {
				fontfaces: families.map((family) => ({ family })),
			}),
		);
	});

describe("useFontLoadCount", () => {
	it("counts loads of the reader's face and nothing else", async () => {
		view = await render(<CountProbe face="OpenDyslexic" />);

		loadingDone("Literata", "Atkinson Hyperlegible");
		expect(count).toBe(0);
		loadingDone("OpenDyslexic");

		expect(count).toBe(1);
	});
});
