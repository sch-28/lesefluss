import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

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

const show = () =>
	render(
		<BookEditLayout
			title="Edit"
			closeIcon="close"
			status=""
			cancelLabel="Cancel"
			saveLabel="Save"
			onCancel={vi.fn()}
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
