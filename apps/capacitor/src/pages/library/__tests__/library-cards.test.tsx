import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Series } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/book-cover", () => ({ default: () => null }));
vi.mock("../../../components/cover-image", () => ({ default: () => null }));
vi.mock("../../../components/device-sync", () => ({ DeviceBadge: () => <span>On device</span> }));
vi.mock("../sync-excluded-badge", () => ({ SyncExcludedBadge: () => null }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: { pace: { wpm: 200, source: "measured" }, books: {} } }),
	},
}));

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

/** The card's own button; a book card also has its … button beside it. */
function card(): HTMLButtonElement {
	const button = view?.container.querySelector("button");
	if (!button) throw new Error("no card button");
	return button;
}

function moreButton(): HTMLButtonElement | null {
	return view?.container.querySelector<HTMLButtonElement>('button[aria-label^="More for"]') ?? null;
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

function touch(el: HTMLElement, type: "touchstart" | "touchend", fingers: number) {
	const event = new TouchEvent(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "touches", { value: Array.from({ length: fingers }, () => ({})) });
	act(() => {
		el.dispatchEvent(event);
	});
}

/** A finger held on the card past the long-press time, with Android's
 *  contextmenu for the held finger, then lifted with its synthetic click. */
function longPress(el: HTMLElement) {
	touch(el, "touchstart", 1);
	act(() => {
		vi.advanceTimersByTime(500);
	});
	rightClick(el);
	touch(el, "touchend", 0);
	act(() => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

const bookProps = (over: Partial<React.ComponentProps<typeof BookCard>> = {}) => ({
	book,
	cover: undefined,
	status: { kind: "reading", progress: 42 } as const,
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

	it("shows the book's #N in its series, and nothing without one", async () => {
		view = await render(<Card {...bookProps()} seriesNumber={2.5} />);
		expect(description(card())).toContain("#2.5");
		view.unmount();
		view = await render(<Card {...bookProps()} seriesNumber={null} />);
		expect(view.container.querySelector('[data-testid="series-number-badge"]')).toBeNull();
	});

	it("opens on click and offers the menu on right-click", async () => {
		const props = bookProps();
		view = await render(<Card {...props} />);
		await click(card());
		expect(props.onOpen).toHaveBeenCalledOnce();
		const event = rightClick(card());
		expect(event.defaultPrevented).toBe(true);
		expect(props.onMenu).toHaveBeenCalledOnce();
		await click(moreButton() as HTMLButtonElement);
		expect(props.onMenu).toHaveBeenCalledTimes(2);
		expect(props.onOpen).toHaveBeenCalledOnce();
	});

	it("hands a Shift, Ctrl or Cmd click to selection instead of opening", async () => {
		const props = bookProps({ onModifiedClick: vi.fn() });
		view = await render(<Card {...props} />);
		for (const modifier of ["shiftKey", "ctrlKey", "metaKey"] as const) {
			act(() => {
				card().dispatchEvent(new MouseEvent("click", { bubbles: true, [modifier]: true }));
			});
		}
		expect(props.onModifiedClick).toHaveBeenCalledTimes(3);
		expect(props.onOpen).not.toHaveBeenCalled();
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
		expect(moreButton()).toBeNull();

		await view.rerender(<Card {...props} selected />);
		expect(card().getAttribute("aria-pressed")).toBe("true");
	});

	it("shows exactly the picked fields, in their own fixed lines", async () => {
		view = await render(<Card {...bookProps()} fields={["words"]} values={{ words: "1,234" }} />);
		expect(view.text()).toContain("1,234");
		expect(view.text()).not.toContain("George Eliot");
		expect(view.text()).not.toContain("42%");
	});

	it("gives an empty field no line, so an unrated book without an author shows only its title and status", async () => {
		const lines = async (over: Partial<typeof book>) => {
			view?.unmount();
			view = await render(
				<Card
					{...bookProps({ book: { ...book, ...over } })}
					fields={["author", "rating", "progress"]}
				/>,
			);
			return [...view.container.querySelectorAll("[data-card-field]")].map((el) =>
				el.getAttribute("data-card-field"),
			);
		};
		expect(await lines({ rating: 8 })).toEqual(["author", "rating", "progress"]);
		expect(await lines({ rating: null, author: null })).toEqual(["progress"]);
		expect(view?.text()).not.toContain("Not rated");
		expect(view?.text()).not.toContain("–");
	});

	it("shows an unread book's time to read, a finished one as finished", async () => {
		view = await render(<Card {...bookProps({ status: { kind: "unread", minutes: 552 } })} />);
		expect(description(card())).toContain("9h 12m read");
		expect(description(card())).not.toContain("%");
		view.unmount();
		view = await render(<Card {...bookProps({ status: { kind: "finished" } })} />);
		expect(description(card())).toContain("Finished");
	});

	describe("long press", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("starts selection, never the menu, and opens nothing on release", async () => {
			const props = bookProps({ onLongPress: vi.fn() });
			view = await render(<Card {...props} />);
			vi.useFakeTimers();
			longPress(card());
			expect(props.onLongPress).toHaveBeenCalledOnce();
			expect(props.onMenu).not.toHaveBeenCalled();
			expect(props.onOpen).not.toHaveBeenCalled();
		});

		it("extends a selection already running instead of toggling on release", async () => {
			const props = bookProps({ selectable: true, onToggle: vi.fn(), onLongPress: vi.fn() });
			view = await render(<Card {...props} />);
			vi.useFakeTimers();
			longPress(card());
			expect(props.onLongPress).toHaveBeenCalledOnce();
			expect(props.onToggle).not.toHaveBeenCalled();
			expect(props.onMenu).not.toHaveBeenCalled();
			expect(props.onOpen).not.toHaveBeenCalled();
		});

		it("opens the menu when the card has no selection to start", async () => {
			const props = bookProps();
			view = await render(<Card {...props} />);
			vi.useFakeTimers();
			longPress(card());
			expect(props.onMenu).toHaveBeenCalledOnce();
			expect(props.onOpen).not.toHaveBeenCalled();
		});

		it("is a tap when lifted early", async () => {
			const props = bookProps({ onLongPress: vi.fn() });
			view = await render(<Card {...props} />);
			vi.useFakeTimers();
			touch(card(), "touchstart", 1);
			act(() => {
				vi.advanceTimersByTime(200);
			});
			touch(card(), "touchend", 0);
			act(() => {
				card().dispatchEvent(new MouseEvent("click", { bubbles: true }));
				vi.advanceTimersByTime(1000);
			});
			expect(props.onOpen).toHaveBeenCalledOnce();
			expect(props.onLongPress).not.toHaveBeenCalled();
		});
	});
});

describe.each([
	["SeriesCard", SeriesCard],
	["SeriesListItem", SeriesListItem],
])("%s", (_, Card) => {
	it("is a button named by the series title that opens on click and menus on right-click", async () => {
		const onOpen = vi.fn();
		const onMenu = vi.fn();
		view = await render(
			<Card
				series={series}
				chapterCount={12}
				chapterLengths={undefined}
				onOpen={onOpen}
				onMenu={onMenu}
			/>,
		);
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

	it("is described only by elements on the page, before the chapter count and without author or time", async () => {
		view = await render(
			<Card
				series={{ ...series, author: null }}
				chapterCount={undefined}
				chapterLengths={undefined}
				onOpen={() => {}}
				onMenu={() => {}}
			/>,
		);
		const ids = (card().getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
	});

	it("follows the book cards' fields, leaving each one a serial has no value for empty", async () => {
		view = await render(
			<Card
				series={series}
				chapterCount={3}
				chapterLengths={[{ wordCount: 6000, wordPosition: 0, finishedAt: null }]}
				onOpen={() => {}}
				onMenu={() => {}}
				fields={["rating", "words"]}
			/>,
		);
		expect(view.text()).not.toContain("nobody103");
		expect(view.container.querySelector('[data-testid="series-card-time"]')).toBeNull();
		const slots = [...view.container.querySelectorAll("[data-card-field]")];
		expect(
			slots.every(
				(slot) => slot.childNodes.length === 0 && /\bempty:hidden\b/.test(slot.className),
			),
		).toBe(true);
	});

	it("shows time left only while the serial is under way, an empty hidden slot otherwise", async () => {
		const chapters: { wordCount: number; wordPosition: number; finishedAt: number | null }[] = [
			{ wordCount: 6000, wordPosition: 0, finishedAt: null },
			{ wordCount: 12_000, wordPosition: 0, finishedAt: null },
			{ wordCount: 0, wordPosition: 0, finishedAt: null },
		];
		const show = (chapterLengths: typeof chapters) =>
			render(
				<Card
					series={series}
					chapterCount={3}
					chapterLengths={chapterLengths}
					onOpen={() => {}}
					onMenu={() => {}}
					fields={["timeLeft"]}
				/>,
			);
		const timeSlot = () => view?.container.querySelector('[data-card-field="timeLeft"]');

		view = await show(chapters);
		expect(view.container.querySelector('[data-testid="series-card-time"]')).toBeNull();
		expect(view.text()).not.toContain("Total");
		expect(timeSlot()?.childNodes.length ?? 0).toBe(0);

		view.unmount();
		view = await show([
			{ ...chapters[0], wordPosition: 6000, finishedAt: 1 },
			...chapters.slice(1),
		]);
		expect(view.text()).toContain("Left 1h");
		expect(description(card())).toContain("Left 1h");

		view.unmount();
		view = await show([
			{ ...chapters[0], wordPosition: 6000, finishedAt: 1 },
			{ ...chapters[1], wordPosition: 12_000, finishedAt: 1 },
			chapters[2],
		]);
		expect(view.container.querySelector('[data-testid="series-card-time"]')).toBeNull();
		expect(view.text()).not.toContain("Total");
		expect(timeSlot()?.childNodes.length ?? 0).toBe(0);
	});
});
