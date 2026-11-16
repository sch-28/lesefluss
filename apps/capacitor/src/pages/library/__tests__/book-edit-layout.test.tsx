import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { canGoBack: () => true, back: vi.fn() } }),
}));
vi.mock("../../../hooks/use-media-query", () => ({ useMediaQuery: () => true }));
const mac = vi.hoisted(() => ({ isMac: false }));
vi.mock("../../../commands/keys", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../commands/keys")>();
	return {
		...actual,
		formatKey: (spec: string) => actual.formatKey(spec, mac.isMac),
		matchesKey: (e: KeyboardEvent, spec: string) => actual.matchesKey(e, spec, mac.isMac),
	};
});

const { BookEditLayout } = await import("../book-edit-layout");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const onCancel = vi.fn();
const show = () =>
	render(
		<BookEditLayout
			title="Edit"
			status=""
			cancelLabel="Cancel"
			saveLabel="Save"
			onCancel={onCancel}
			onSave={vi.fn()}
			canSave
			isSaving={false}
			isBusy={false}
		>
			<p>form</p>
		</BookEditLayout>,
	);

describe("BookEditLayout keyboard hint", () => {
	it("names Ctrl off a Mac", async () => {
		mac.isMac = false;
		view = await show();
		expect(view.text()).toContain("Ctrl+S save · Esc cancel");
		expect(view.text()).not.toContain("⌘");
	});

	it("names ⌘ on a Mac", async () => {
		mac.isMac = true;
		view = await show();
		expect(view.text()).toContain("⌘+S save · Esc cancel");
	});
});

describe("BookEditLayout header", () => {
	it("has one Back and one Cancel, both leaving through the page's cancel", async () => {
		onCancel.mockClear();
		view = await show();
		const names = [...view.container.querySelectorAll("button")].map(
			(b) => b.getAttribute("aria-label") ?? b.textContent,
		);
		expect(names.filter((n) => n === "Cancel")).toHaveLength(1);
		expect(names.filter((n) => n === "Back")).toHaveLength(1);
		await click(view.getButton("Back"));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
