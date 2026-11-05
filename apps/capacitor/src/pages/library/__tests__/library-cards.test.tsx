import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Series } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/book-cover", () => ({ default: () => null }));
vi.mock("../../../components/cover-image", () => ({ default: () => null }));
vi.mock("../../../components/device-sync", () => ({ DeviceBadge: () => <span>On device</span> }));
vi.mock("../sync-excluded-badge", () => ({ SyncExcludedBadge: () => null }));

const { default: BookCard } = await import("../book-card");
const { default: BookListItem } = await import("../book-list-item");
const { default: SeriesCard } = await import("../series-card");
const { default: SeriesListItem } = await import("../series-list-item");

const book = makeBook({ title: "Middlemarch", author: "George Eliot" });
const series: Series = {
	id: "s1",
	title: "Mother of Learning",
	author: "nobody103",
	coverImage: null,
	description: null,
	sourceUrl: "https://example.com/s",
	tocUrl: "https://example.com/s",
	provider: "royalroad",
	lastCheckedAt: null,
	createdAt: 0,
	deleted: false,
	updatedAt: 0,
};

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function card(): HTMLButtonElement {
	const buttons = view?.container.querySelectorAll("button") ?? [];
	expect(buttons).toHaveLength(1);
	return buttons[0] as HTMLButtonElement;
}

function description(el: HTMLElement): string {
	return (el.getAttribute("aria-describedby") ?? "")
		.split(" ")
		.map((id) => document.getElementById(id)?.textContent ?? "")
		.join(" ");
}

function rightClick(el: HTMLElement): MouseEvent {
	const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
	act(() => {
		el.dispatchEvent(event);
	});
	return event;
}

const bookProps = (over: Partial<React.ComponentProps<typeof BookCard>> = {}) => ({
	book,
	cover: undefined,
	progress: 42,
	started: true,
	onOpen: vi.fn(),
	onMenu: vi.fn(),
	...over,
});

describe.each([
	["BookCard", BookCard],
	["BookListItem", BookListItem],
])("%s", (_, Card) => {
	it("is one focusable button named by the book title, described by author and progress", async () => {
		view = await render(<Card {...bookProps()} />);
		const button = card();
		expect(button.type).toBe("button");
		expect(button.getAttribute("aria-label")).toBe("Middlemarch");
		expect(button.hasAttribute("aria-pressed")).toBe(false);
		expect(description(button)).toContain("George Eliot");
		expect(description(button)).toContain("42%");
		expect(description(button)).toContain("On device");
		expect(button.querySelector("a, input, select, textarea, [tabindex]")).toBeNull();
	});

	it("opens on click and offers the menu on right-click", async () => {
		const props = bookProps();
		view = await render(<Card {...props} />);
		await click(card());
		expect(props.onOpen).toHaveBeenCalledOnce();
		const event = rightClick(card());
		expect(event.defaultPrevented).toBe(true);
		expect(props.onMenu).toHaveBeenCalledOnce();
	});

	it("in selection mode exposes the pressed state and toggles instead of opening", async () => {
		const props = bookProps({ selectable: true, selected: false, onToggle: vi.fn() });
		view = await render(<Card {...props} />);
		expect(card().getAttribute("aria-pressed")).toBe("false");
		await click(card());
		expect(props.onToggle).toHaveBeenCalledOnce();
		expect(props.onOpen).not.toHaveBeenCalled();
		rightClick(card());
		expect(props.onMenu).not.toHaveBeenCalled();

		await view.rerender(<Card {...props} selected />);
		expect(card().getAttribute("aria-pressed")).toBe("true");
	});
});

describe.each([
	["SeriesCard", SeriesCard],
	["SeriesListItem", SeriesListItem],
])("%s", (_, Card) => {
	it("is a button named by the series title that opens on click and menus on right-click", async () => {
		const onOpen = vi.fn();
		const onMenu = vi.fn();
		view = await render(<Card series={series} chapterCount={12} onOpen={onOpen} onMenu={onMenu} />);
		const button = card();
		expect(button.type).toBe("button");
		expect(button.getAttribute("aria-label")).toBe("Mother of Learning");
		expect(description(button)).toContain("nobody103");
		expect(description(button)).toMatch(/12/);
		await click(button);
		expect(onOpen).toHaveBeenCalledOnce();
		rightClick(card());
		expect(onMenu).toHaveBeenCalledOnce();
	});
});
