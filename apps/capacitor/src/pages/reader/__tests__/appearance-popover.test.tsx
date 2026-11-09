import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

const appearance = vi.hoisted(() => ({
	fontSize: 18,
	fontFamily: "literata",
	isBold: false,
	textAlign: "left",
	readingRuler: { isOn: false, lines: 1 },
	lineSpacing: 1.8,
	margin: 16,
	letterSpacing: 0,
	wordSpacing: 0,
	paragraphSpacing: 1.1,
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
	applySpacingPreset: vi.fn(),
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

function buttonByText(body: HTMLElement, text: string) {
	const button = [...body.querySelectorAll<HTMLElement>("button")].find(
		(b) => b.textContent === text,
	);
	if (!button) throw new Error(`no ${text} button`);
	return button;
}

describe("AppearancePopover", () => {
	it("holds five rows: theme, font and size, spacing, layout, more settings", async () => {
		const body = await mount();
		const rows = [...body.querySelectorAll("[data-appearance-row]")].map((r) =>
			r.getAttribute("data-appearance-row"),
		);
		expect(rows).toEqual(["theme", "text", "spacing", "layout", "more"]);
		expect(body.textContent).toContain("applies to the whole app");
		for (const gone of ["Margins", "Bold text", "Justify text", "Reading ruler", "Word spacing"]) {
			expect(body.textContent).not.toContain(gone);
		}
		await click(buttonByText(body, "More settings"));
		expect(onOpenAllSettings).toHaveBeenCalledTimes(1);
	});

	it("steps the text size by the setting's step", async () => {
		const body = await mount();
		const inc = body.querySelector<HTMLElement>('[aria-label="Increase text size"]');
		if (!inc) throw new Error("no text size stepper");
		await click(inc);
		expect(appearance.adjustFontSize).toHaveBeenCalledWith(expect.any(Number));
		expect(appearance.adjustFontSize.mock.calls[0]?.[0]).toBeGreaterThan(0);
	});

	it("shows the matching spacing preset and applies another in one save", async () => {
		const body = await mount();
		expect(buttonByText(body, "Normal").getAttribute("data-state")).toBe("on");
		await click(buttonByText(body, "Airy"));
		expect(appearance.applySpacingPreset).toHaveBeenCalledWith("airy");
	});

	it("selects no preset once spacing was fine-tuned in Settings", async () => {
		const saved = appearance.wordSpacing;
		appearance.wordSpacing = 0.2;
		try {
			const body = await mount();
			for (const label of ["Compact", "Normal", "Airy"]) {
				expect(buttonByText(body, label).getAttribute("data-state")).toBe("off");
			}
			expect(body.textContent).toContain("custom");
		} finally {
			appearance.wordSpacing = saved;
		}
	});

	it("switches between scroll and page", async () => {
		const body = await mount();
		expect(buttonByText(body, "Scroll").getAttribute("data-state")).toBe("on");
		await click(buttonByText(body, "Page"));
		expect(appearance.setPaginationStyle).toHaveBeenCalledWith("page");
	});

	it("picks a font from the font list and returns to the rows", async () => {
		const body = await mount();
		const fontButton = body.querySelector<HTMLElement>('[aria-label^="Font: "]');
		if (!fontButton) throw new Error("no font button");
		await click(fontButton);
		const list = body.querySelector('[data-testid="appearance-fonts"]');
		expect(list).not.toBeNull();
		const serif = list?.querySelectorAll<HTMLElement>("button[aria-pressed]")[1];
		if (!serif) throw new Error("no second font");
		await click(serif);
		expect(appearance.setFontFamily).toHaveBeenCalledTimes(1);
		expect(body.querySelector('[data-testid="appearance-rows"]')).not.toBeNull();
	});
});
