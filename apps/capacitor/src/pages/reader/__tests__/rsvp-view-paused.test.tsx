import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import RsvpView, { type RsvpAudio } from "../rsvp-view";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { push: vi.fn() }, navigate: vi.fn() }),
}));
vi.mock("../../../contexts/theme-context", () => ({
	useTheme: () => ({ theme: "light" }),
	focalLetterColorFor: (color: string) => color,
}));
vi.mock("../../settings/rsvp-settings-form", () => ({ default: () => null }));

const SETTINGS = {
	wpm: 300,
	delayComma: 1,
	delayPeriod: 1,
	accelStart: 1,
	accelRate: 0,
	xOffset: 50,
	focalLetterColor: "#f00",
};
const content = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
const noop = () => {};
const audio: RsvpAudio = {
	isOn: true,
	isPlaying: false,
	onToggleAudio: noop,
	onTogglePlay: noop,
	wpm: 200,
	onWpmChange: noop,
	isSleepTimerOn: false,
	onOpenVoice: noop,
	onOpenSleepTimer: noop,
};

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.restoreAllMocks();
});

const props = {
	content,
	initialWord: 10,
	settings: SETTINGS,
	fontSize: 20,
	onPositionChange: noop,
	onFinished: noop,
	onWpmChange: noop,
	onLookup: noop,
};

const pillLabels = (rendered: Rendered) =>
	[...rendered.container.querySelectorAll(".rsvp-pill-stack button")].map((b) =>
		b.getAttribute("aria-label"),
	);

describe("RsvpView paused", () => {
	it("sets the context around the word in the reader's font and alignment", async () => {
		view = await render(
			<RsvpView
				content={content}
				initialWord={10}
				settings={SETTINGS}
				fontSize={20}
				onPositionChange={noop}
				onFinished={noop}
				onWpmChange={noop}
				onLookup={noop}
				contextFontFamily="serif"
				contextTextAlign="justify"
			/>,
		);
		const word = view.container.querySelector<HTMLElement>(".rsvp-word-container");
		expect(word?.style.getPropertyValue("--rsvp-context-font")).toMatch(/serif/i);
		expect(word?.style.getPropertyValue("--reader-text-align")).toBe("justify");
	});

	it("puts the card between the side buttons, Voice above RSVP settings and Sleep timer above Look up", async () => {
		view = await render(
			<RsvpView
				content={content}
				initialWord={10}
				settings={SETTINGS}
				fontSize={20}
				onPositionChange={noop}
				onFinished={noop}
				onWpmChange={noop}
				onLookup={noop}
				audio={audio}
			/>,
		);
		const band = [...(view.container.querySelector(".rsvp-band")?.children ?? [])].map((child) =>
			child.classList.contains("rsvp-controls")
				? "card"
				: [...child.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
		);
		expect(band).toEqual([["Voice", "RSVP settings"], "card", ["Sleep timer", "Look up"]]);
	});

	it("keeps RSVP settings before Look up when there is no voice, and labels them in full", async () => {
		view = await render(<RsvpView {...props} />);
		expect(pillLabels(view)).toEqual(["RSVP settings", "Look up"]);
	});

	/** Lays the band out: rects by class, widths by class (labelled pills are 130px). */
	const layout = (rects: Record<string, Partial<DOMRect>>, widths: Record<string, number>) => {
		const find = <T,>(el: Element, by: Record<string, T>) =>
			Object.keys(by).find((cls) => el.classList.contains(cls));
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
			this: Element,
		) {
			const match = find(this, rects);
			return { top: 0, bottom: 0, ...(match ? rects[match] : {}) } as DOMRect;
		});
		const width = (el: HTMLElement) => {
			const match = find(el, widths);
			if (!match) return 0;
			const labelled = el.closest(".rsvp-band")?.getAttribute("data-pills") === "labels";
			return match === "rsvp-band" || match === "rsvp-controls" || labelled ? widths[match] : 44;
		};
		vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
			this: HTMLElement,
		) {
			return width(this);
		});
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
			this: HTMLElement,
		) {
			return width(this);
		});
	};
	const pillWidths = (band: number) => ({
		"rsvp-band": band,
		"rsvp-controls": 246,
		"rsvp-settings-button": 130,
		"rsvp-dict-button": 100,
	});

	it("centres the word in the room above the band, and keeps it there while playing", async () => {
		layout({ "rsvp-display-inner": { bottom: 700 }, "rsvp-band": { top: 573 } }, pillWidths(676));
		view = await render(<RsvpView {...props} />);
		const display = view.container.querySelector<HTMLElement>(".rsvp-display");
		expect(display?.style.getPropertyValue("--rsvp-band-space")).toBe("127px");

		await click(display as HTMLElement);
		expect(view.container.querySelector(".rsvp-band")).toBeNull();
		expect(display?.style.getPropertyValue("--rsvp-band-space")).toBe("127px");
	});

	it("lifts the band off a progress bar taller than the overlay allows for", async () => {
		layout(
			{
				"rsvp-display-inner": { bottom: 700 },
				"reader-progress-bar": { top: 684 },
				"rsvp-band": { top: 557 },
			},
			pillWidths(676),
		);
		view = await render(
			<div>
				<RsvpView {...props} />
				<div className="reader-progress-bar" />
			</div>,
		);
		const display = view.container.querySelector<HTMLElement>(".rsvp-display");
		expect(display?.style.getPropertyValue("--rsvp-bar-overlap")).toBe("16px");
		expect(display?.style.getPropertyValue("--rsvp-band-space")).toBe("143px");
	});

	it("labels the side buttons where they fit, else shows icons, else lifts them above the card", async () => {
		for (const [band, fit] of [
			[676, "labels"],
			[360, "icons"],
			[320, "above"],
		] as const) {
			layout({}, pillWidths(band));
			view = await render(<RsvpView {...props} />);
			expect(
				view.container.querySelector(".rsvp-band")?.getAttribute("data-pills"),
				`${band}`,
			).toBe(fit);
			view.unmount();
			view = undefined;
			vi.restoreAllMocks();
		}
	});

	it("shows the ramp-up toward the set speed while it accelerates", async () => {
		view = await render(<RsvpView {...props} settings={{ ...SETTINGS, accelStart: 2 }} />);
		await click(view.container.querySelector<HTMLElement>(".rsvp-display") as HTMLElement);
		expect(view.container.querySelector(".rsvp-speed-chip--ramping")?.textContent).toBe(
			"150 → 300 wpm",
		);
	});

	it("separates the context words with spaces, so a justified reader can justify them", async () => {
		view = await render(<RsvpView {...props} />);
		const next = view.container.querySelector(".rsvp-context-next");
		const words = [...(next?.querySelectorAll(".rsvp-context-word") ?? [])];
		expect(words.length).toBeGreaterThan(1);
		expect(words[1].previousSibling?.textContent).toBe(" ");
	});
});
