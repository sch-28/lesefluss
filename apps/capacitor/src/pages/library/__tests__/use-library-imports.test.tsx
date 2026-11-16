import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const parsed = { payload: { title: "Dune" }, extras: {} };
const stage = vi.fn();
let failWith: Record<string, string> = {};
const mutation = (name: string) => () => ({
	mutateAsync: async () => {
		if (failWith[name]) throw new Error(failWith[name]);
		return parsed;
	},
	mutate: () => {},
	reset: () => {},
	isPending: false,
	error: null,
});

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useImportBook: mutation("file"),
		useImportBookFromClipboard: mutation("clipboard"),
		useImportBookFromUrl: mutation("url"),
		useImportBookFromText: mutation("text"),
		useImportSerialFromUrl: mutation("serial"),
	},
}));
vi.mock("../../../contexts/import-staging-context", () => ({
	useImportStaging: () => ({ stage }),
}));
vi.mock("../../../components/toast", () => ({ useToast: () => ({ showToast: () => {} }) }));

const { useLibraryImports } = await import("../use-library-imports");

let imports: ReturnType<typeof useLibraryImports>;
let rendered: Rendered;
const Probe = ({ target }: { target?: string }) => {
	imports = useLibraryImports(target);
	return null;
};
afterEach(() => {
	rendered.unmount();
	stage.mockClear();
	failWith = {};
});

describe("useLibraryImports", () => {
	it("stages an import started inside a collection with that collection as its target", async () => {
		rendered = await render(<Probe target="c1" />);
		await act(async () => imports.importFromFile());
		expect(stage).toHaveBeenCalledWith({ ...parsed, targetCollectionId: "c1" });
	});

	it("stages an import from the whole library without a target", async () => {
		rendered = await render(<Probe />);
		await act(async () => imports.importFromClipboard());
		expect(stage).toHaveBeenCalledWith(parsed);
	});

	it("opens a text box on the web when the clipboard is empty or blocked, and imports what is typed", async () => {
		failWith = { clipboard: "EMPTY" };
		rendered = await render(<Probe />);
		await act(async () => imports.importFromClipboard());
		expect(stage).not.toHaveBeenCalled();
		expect(imports.pasteTextOpen).toBe(true);
		await act(async () => imports.importFromText("Some text"));
		expect(stage).toHaveBeenCalledWith(parsed);
		expect(imports.pasteTextOpen).toBe(false);
	});

	it("keeps a failed link import's error for the URL dialog, not the global alert", async () => {
		failWith = { url: "INVALID_URL" };
		rendered = await render(<Probe />);
		const onSuccess = vi.fn();
		await act(async () => imports.importFromUrl("not a link", { onSuccess }));
		expect(onSuccess).not.toHaveBeenCalled();
		expect(imports.urlError).toContain("doesn't look like a link");
		expect(imports.errorMessage).toBeNull();
		act(() => imports.clearUrlError());
		expect(imports.urlError).toBeNull();
	});
});
