import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

const appearance = vi.hoisted(() => ({
	fontSize: 18,
	fontFamily: "literata",
	isBold: false,
	textAlign: "left",
	readingRuler: { isOn: false, lines: 1 },
	lineSpacing: 1.5,
	margin: 16,
	letterSpacing: 0,
	wordSpacing: 0,
	paragraphSpacing: 1,
	paginationStyle: "scroll",
	isMotionReduced: false,
	isEinkMode: false,
	adjustFontSize: vi.fn(),
	adjustLineSpacing: vi.fn(),
	adjustMargin: vi.fn(),
	adjustLetterSpacing: vi.fn(),
	adjustWordSpacing: vi.fn(),
	adjustParagraphSpacing: vi.fn(),
	resetTextSpacing: vi.fn(),
	setFontFamily: vi.fn(),
	setBold: vi.fn(),
	setTextAlign: vi.fn(),
	setReadingRuler: vi.fn(),
	setReadingRulerLines: vi.fn(),
	setPaginationStyle: vi.fn(),
}));
vi.mock("../../../hooks/use-appearance-settings", async (importActual) => ({
	...(await importActual<typeof import("../../../hooks/use-appearance-settings")>()),
	useAppearanceSettings: () => appearance,
}));
vi.mock("../../../contexts/theme-context", () => ({
	useTheme: () => ({ storedTheme: "light", setTheme: vi.fn() }),
}));

const AppearancePopover = (await import("../appearance-popover")).default;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const onOpenAllSettings = vi.fn();

async function mount() {
	view = await render(
		<AppearancePopover
			open
			onOpenChange={vi.fn()}
			anchor={<span />}
			onOpenAllSettings={onOpenAllSettings}
		/>,
	);
	return document.body;
}

describe("AppearancePopover", () => {
	it("uses the Settings › Reader labels and links to all settings", async () => {
		const body = await mount();
		for (const label of [
			"Text size",
			"Line spacing",
			"Letter spacing",
			"Word spacing",
			"Paragraph spacing",
			"Margins",
			"Bold text",
			"Justify text",
			"Reading ruler",
		]) {
			expect(body.textContent).toContain(label);
		}
		const all = [...body.querySelectorAll<HTMLElement>("button")].find(
			(b) => b.textContent === "All settings",
		);
		if (!all) throw new Error("no All settings");
		await click(all);
		expect(onOpenAllSettings).toHaveBeenCalledTimes(1);
	});

	it("changes and resets spacing through the Settings rows", async () => {
		const body = await mount();
		const inc = body.querySelector<HTMLElement>('[aria-label="Increase Word spacing"]');
		if (!inc) throw new Error("no word spacing stepper");
		await click(inc);
		expect(appearance.adjustWordSpacing).toHaveBeenCalledTimes(1);
		const reset = [...body.querySelectorAll<HTMLElement>("button")].find(
			(b) => b.textContent === "Reset spacing",
		);
		if (!reset) throw new Error("no Reset spacing");
		await click(reset);
		expect(appearance.resetTextSpacing).toHaveBeenCalledTimes(1);
	});

	it("turns justify on through the same switch as Settings", async () => {
		const body = await mount();
		const sw = body.querySelector<HTMLElement>("#ap-reader-justify");
		if (!sw) throw new Error("no switch");
		await click(sw);
		expect(appearance.setTextAlign).toHaveBeenCalledWith("justify");
	});
});
