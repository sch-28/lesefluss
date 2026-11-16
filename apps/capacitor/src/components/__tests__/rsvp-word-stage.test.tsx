import { calcOrpIndex } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../test/render";

vi.mock("../../contexts/theme-context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "light", isEinkMode: false }),
}));

const { RsvpWordStage } = await import("../rsvp-word-stage");
const { default: RsvpPreview } = await import("../../pages/settings/rsvp-preview");

const settings = {
	wpm: 300,
	delayComma: 2,
	delayPeriod: 3,
	accelStart: 2,
	accelRate: 0.1,
	xOffset: 40,
	focalLetterColor: "#ff0000",
};

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function parts(root: HTMLElement) {
	return ["before", "focal", "after"].map((k) => root.querySelector(`.rsvp-${k}`)?.textContent);
}

describe("RsvpWordStage", () => {
	it("splits the word at its focal letter and anchors it at the offset", async () => {
		const onClick = vi.fn();
		view = await render(
			<RsvpWordStage
				word="reading"
				settings={settings}
				label="Tap"
				ariaLabel="Play"
				onClick={onClick}
			/>,
		);
		const orp = calcOrpIndex(7);
		expect(parts(view.container)).toEqual([
			"reading".slice(0, orp),
			"reading"[orp],
			"reading".slice(orp + 1),
		]);
		expect((view.container.querySelector(".rsvp-focal-line") as HTMLElement).style.left).toBe(
			"40%",
		);
		await click(view.getButton("Play"));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("is what the settings preview renders", async () => {
		view = await render(<RsvpPreview settings={settings} />);
		const orp = calcOrpIndex(3);
		expect(parts(view.container)).toEqual(["The".slice(0, orp), "The"[orp], "The".slice(orp + 1)]);
		expect(view.getButton("Pause preview")).toBeDefined();
	});
});
