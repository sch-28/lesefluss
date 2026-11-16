import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { filterToTree } from "../condition-tree";
import { encodeFilterParam, type LibraryFilter } from "../filter-model";

const useShelfEditor = vi.fn();
const save = vi.fn();
const back = vi.fn();
let isWide = true;
let isDirty = false;
let shouldBlock: (() => boolean) | undefined;

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { canGoBack: () => true, back }, navigate: vi.fn() }),
	useBlocker: (o: { shouldBlockFn: () => boolean }) => {
		shouldBlock = o.shouldBlockFn;
		return { status: "idle" };
	},
}));
vi.mock("../book-edit-layout", () => ({
	useIsWideLayout: () => isWide,
	BookEditLayout: (p: {
		title: string;
		saveLabel: string;
		canSave: boolean;
		onSave: () => void;
		onCancel: () => void;
		status: React.ReactNode;
		children: React.ReactNode;
	}) => (
		<div>
			<h1>{p.title}</h1>
			{p.status}
			<button type="button" onClick={p.onCancel}>
				Cancel
			</button>
			<button type="button" disabled={!p.canSave} onClick={p.onSave}>
				{p.saveLabel}
			</button>
			{p.children}
		</div>
	),
}));
vi.mock("../shelf-condition-editor", () => ({
	useShelfEditor: (options: unknown) => {
		useShelfEditor(options);
		return {
			body: <div data-testid="editor-body" />,
			save,
			canSave: true,
			hint: "Name the shelf to save it.",
			countLabel: "3 books match",
			isPending: false,
			isDirty,
		};
	},
}));

const { default: NewShelfPage } = await import("../new-shelf-page");

let rendered: Rendered;
afterEach(() => {
	rendered.unmount();
	vi.clearAllMocks();
	isWide = true;
	isDirty = false;
});

describe("NewShelfPage", () => {
	it("is a page like New collection: title, editor, live count and Create shelf", async () => {
		rendered = await render(<NewShelfPage />);
		expect(rendered.container.querySelector("h1")?.textContent).toBe("New smart shelf");
		expect(rendered.container.querySelector("[data-testid=editor-body]")).not.toBeNull();
		expect(rendered.text()).toContain("3 books match");
		expect(rendered.text()).toContain("Name the shelf to save it.");
		rendered.getButton("Create shelf").click();
		expect(save).toHaveBeenCalled();
		rendered.getButton("Cancel").click();
		expect(back).toHaveBeenCalled();
		expect(useShelfEditor).toHaveBeenLastCalledWith(
			expect.objectContaining({
				shelf: null,
				initialTree: undefined,
				isStacked: false,
				replaceOnSave: true,
			}),
		);
	});

	it("starts from the library filter it was opened with, stacked on a phone", async () => {
		isWide = false;
		const filter: LibraryFilter = { status: { in: ["reading"], out: [] } };
		rendered = await render(<NewShelfPage filterParam={encodeFilterParam(filter)} />);
		expect(useShelfEditor).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialTree: filterToTree(filter), isStacked: true }),
		);
	});

	it("asks before leaving an edited shelf, but not once it is created", async () => {
		rendered = await render(<NewShelfPage />);
		expect(shouldBlock?.()).toBe(false);
		rendered.unmount();
		isDirty = true;
		rendered = await render(<NewShelfPage />);
		expect(shouldBlock?.()).toBe(true);
		const { onDone } = useShelfEditor.mock.lastCall?.[0] as { onDone: () => void };
		onDone();
		expect(shouldBlock?.()).toBe(false);
	});
});
