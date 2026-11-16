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
	[...rendered.container.querySelectorAll(".rsvp-pills button")].map((b) =>
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

	it("puts Voice, Sleep timer, RSVP settings and Look up in one row", async () => {
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
		const rows = view.container.querySelectorAll(".rsvp-pills");
		expect(rows).toHaveLength(1);
		const labels = [...rows[0].querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
		expect(labels).toEqual(["Voice", "Sleep timer", "RSVP settings", "Look up"]);
	});

	it("keeps RSVP settings before Look up when there is no voice, and labels them in full", async () => {
		view = await render(<RsvpView {...props} />);
		expect(pillLabels(view)).toEqual(["RSVP settings", "Look up"]);
		expect(view.container.querySelector(".rsvp-pills--four")).toBeNull();
	});

	const layout = (rects: Record<string, Partial<DOMRect>>) =>
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
			this: Element,
		) {
			const match = Object.keys(rects).find((cls) => this.classList.contains(cls));
			return { top: 0, bottom: 0, ...(match ? rects[match] : {}) } as DOMRect;
		});

	it("bounds the context below the word by the controls card's top, and drops the bound on play", async () => {
		layout({
			"rsvp-controls": { top: 600 },
			"rsvp-word-line": { bottom: 300 },
			"rsvp-context-next": { top: 320 },
		});
		view = await render(<RsvpView {...props} />);
		const display = view.container.querySelector<HTMLElement>(".rsvp-display");
		expect(display?.style.getPropertyValue("--rsvp-next-max")).toBe("268px");
		expect(display?.style.getPropertyValue("--rsvp-word-lift")).toBe("0px");

		await click(view.container.querySelector<HTMLElement>(".rsvp-display") as HTMLElement);
		expect(display?.style.getPropertyValue("--rsvp-next-max")).toBe("");
		expect(display?.style.getPropertyValue("--rsvp-word-lift")).toBe("");
	});

	it("raises the word clear of the controls card on a screen too short to centre it", async () => {
		layout({ "rsvp-controls": { top: 300 }, "rsvp-word-line": { bottom: 330 } });
		view = await render(<RsvpView {...props} />);
		const display = view.container.querySelector<HTMLElement>(".rsvp-display");
		expect(display?.style.getPropertyValue("--rsvp-word-lift")).toBe("42px");
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
