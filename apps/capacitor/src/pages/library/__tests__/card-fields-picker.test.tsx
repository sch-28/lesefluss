import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import {
	CARD_FIELDS_KEY,
	type CardFieldId,
	type CardSurface,
	DEFAULT_CARD_FIELDS,
	useCardFields,
} from "../card-fields";
import { CardFieldsPanel } from "../card-fields-picker";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const preview = (surface: CardSurface, fields: readonly CardFieldId[]) => (
	<span data-testid="preview-card">{`${surface}: ${fields.join(",")}`}</span>
);

function checkbox(label: string): HTMLInputElement {
	const box = [...(view?.container.querySelectorAll("label") ?? [])]
		.find((l) => l.textContent === label)
		?.querySelector("input");
	if (!box) throw new Error(`no ${label} checkbox`);
	return box;
}

describe("CardFieldsPanel", () => {
	it("ticks the shown view's fields, toggles one, and previews the card as it will look", async () => {
		const onToggle = vi.fn();
		view = await render(
			<CardFieldsPanel
				surface="grid"
				settings={{ grid: ["author", "rating"], list: DEFAULT_CARD_FIELDS.list }}
				onToggle={onToggle}
				renderPreview={preview}
			/>,
		);
		expect(checkbox("Author").checked).toBe(true);
		expect(checkbox("Words").checked).toBe(false);
		expect(view.text()).toContain("grid: author,rating");
		await click(checkbox("Time left"));
		expect(onToggle).toHaveBeenCalledWith("grid", "timeLeft");
	});

	it("edits the list rows' own fields when the list is on screen", async () => {
		const onToggle = vi.fn();
		view = await render(
			<CardFieldsPanel
				surface="list"
				settings={{ grid: ["author"], list: ["words"] }}
				onToggle={onToggle}
				renderPreview={preview}
			/>,
		);
		expect(view.text()).toContain("list: words");
		expect(checkbox("Words").checked).toBe(true);
		await click(checkbox("Rating"));
		expect(onToggle).toHaveBeenCalledWith("list", "rating");
	});

	it("shows no preview when the library has no book to draw", async () => {
		view = await render(
			<CardFieldsPanel
				surface="list"
				settings={DEFAULT_CARD_FIELDS}
				onToggle={vi.fn()}
				renderPreview={() => null}
			/>,
		);
		expect(view.container.querySelector('[data-testid="card-fields-preview"]')).toBeNull();
	});
});

describe("useCardFields", () => {
	let latest: ReturnType<typeof useCardFields>;
	const Probe = () => {
		latest = useCardFields();
		return null;
	};

	it("remembers the picked fields on this device", async () => {
		localStorage.clear();
		view = await render(<Probe />);
		expect(latest.settings).toEqual(DEFAULT_CARD_FIELDS);
		act(() => latest.toggle("list", "words"));
		expect(latest.settings.list).toContain("words");
		expect(latest.settings.grid).toEqual(DEFAULT_CARD_FIELDS.grid);
		view.unmount();
		view = await render(<Probe />);
		expect(latest.settings.list).toContain("words");
		expect(JSON.parse(localStorage.getItem(CARD_FIELDS_KEY) ?? "{}").list).toContain("words");
	});
});
