import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";

const toastMock = vi.hoisted(() => ({
	loading: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	dismiss: vi.fn(),
}));
const importFromCatalog = vi.hoisted(() => vi.fn());
vi.mock("../../../components/toast", () => ({ toast: toastMock }));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog }));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { useCatalogImport } = await import("../use-catalog-import");

function Importer({ intent }: { intent: "read" | "add" }) {
	const { start } = useCatalogImport("gutenberg:84");
	return (
		<button type="button" onClick={() => start({ title: "Frankenstein", intent })}>
			Import
		</button>
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("useCatalogImport toasts", () => {
	it("turns the loading toast into the result under one id", async () => {
		importFromCatalog.mockResolvedValue({ book: { id: "b1" }, existed: false });
		view = await render(<Importer intent="add" />);
		await click(view.getButton("Import"));
		await flush();
		const [, loadingOpts] = toastMock.loading.mock.calls[0] ?? [];
		expect(loadingOpts.id).toBe("import:catalog:gutenberg:84");
		expect(toastMock.success).toHaveBeenCalledWith(
			'Added "Frankenstein" to your library',
			expect.objectContaining({ id: loadingOpts.id }),
		);
	});

	it("puts a failure in the same toast, with Retry", async () => {
		importFromCatalog.mockRejectedValue(new Error("offline"));
		view = await render(<Importer intent="add" />);
		await click(view.getButton("Import"));
		await flush();
		expect(toastMock.error).toHaveBeenCalledWith(
			'Couldn\'t add "Frankenstein"',
			expect.objectContaining({
				id: "import:catalog:gutenberg:84",
				action: expect.objectContaining({ label: "Retry" }),
			}),
		);
	});

	it("drops the loading toast when the reader opens instead", async () => {
		importFromCatalog.mockResolvedValue({ book: { id: "b1" }, existed: false });
		view = await render(<Importer intent="read" />);
		await click(view.getButton("Import"));
		await flush();
		expect(toastMock.dismiss).toHaveBeenCalledWith("import:catalog:gutenberg:84");
		expect(toastMock.success).not.toHaveBeenCalled();
	});
});
