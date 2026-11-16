import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";

const toastMock = vi.hoisted(() => ({
	loading: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	dismiss: vi.fn(),
}));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("../../../components/toast", () => ({ toast: toastMock }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: { useImportSerialFromUrl: () => ({ mutateAsync }) },
}));
vi.mock("../../../services/db/hooks/query-keys", () => ({
	serialImportMutationKey: (url: string) => ["serial-import", url],
}));
vi.mock("../../../services/serial-scrapers", () => ({ normalizeSeriesUrl: (url: string) => url }));
vi.mock("../use-library-membership", () => ({ useLibrarySeriesByUrl: () => new Map() }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { useWebNovelImport } = await import("../use-web-novel-import");

const SERIES_URL = "https://example.com/series/1";
const ID = `import:serial:${SERIES_URL}`;

function Importer({ onDone }: { onDone?: () => void }) {
	const { start } = useWebNovelImport(SERIES_URL);
	return (
		<button type="button" onClick={() => start("Mother of Learning", onDone)}>
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

describe("useWebNovelImport toasts", () => {
	it.each([
		["from a card", undefined],
		["from the preview", vi.fn()],
	])("turns the loading toast into the result under one id, %s", async (_, onDone) => {
		mutateAsync.mockResolvedValue({ id: "s1" });
		view = await render(<Importer onDone={onDone} />);
		await click(view.getButton("Import"));
		await flush();
		expect(toastMock.loading).toHaveBeenCalledWith(
			'Adding "Mother of Learning"…',
			expect.objectContaining({ id: ID }),
		);
		expect(toastMock.success).toHaveBeenCalledWith(
			'Added "Mother of Learning" to your library',
			expect.objectContaining({ id: ID }),
		);
		if (onDone) expect(onDone).toHaveBeenCalledOnce();
	});

	it("puts a failure in the same toast, with Retry", async () => {
		mutateAsync.mockRejectedValue(new Error("offline"));
		view = await render(<Importer />);
		await click(view.getButton("Import"));
		await flush();
		expect(toastMock.error).toHaveBeenCalledWith(
			'Couldn\'t add "Mother of Learning"',
			expect.objectContaining({ id: ID, action: expect.objectContaining({ label: "Retry" }) }),
		);
	});
});
