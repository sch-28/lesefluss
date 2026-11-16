import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const parsed = { payload: { title: "Dune" }, extras: {} };
const stage = vi.fn();
const mutation = () => ({
	mutateAsync: async () => parsed,
	mutate: () => {},
	reset: () => {},
	isPending: false,
	error: null,
});

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useImportBook: mutation,
		useImportBookFromClipboard: mutation,
		useImportBookFromUrl: mutation,
		useImportSerialFromUrl: mutation,
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
});
