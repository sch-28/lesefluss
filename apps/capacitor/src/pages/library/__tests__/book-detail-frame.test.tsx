import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { flush, type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({ isReady: false }));
const book = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: new Proxy(
		{},
		{
			get: (_target, name) => () => {
				if (name === "useBook") return { data: book.current, isPending: false };
				if (name === "useAddNumberedBooks") return { isPending: false, mutate: vi.fn() };
				return { data: undefined, isPending: false, isLoading: false };
			},
		},
	),
}));
vi.mock("../../../contexts/theme-context", async (importActual) => ({
	...(await importActual<typeof import("../../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "dark", isEinkMode: false }),
}));
vi.mock("../use-book-detail-ready", () => ({ useBookDetailReady: () => state.isReady }));
vi.mock("../use-book-series", () => ({
	useBookSeries: () => null,
	useAuthorSeriesSuggestion: () => null,
}));
vi.mock("../book-actions/use-book-actions", () => ({
	useBookActions: () => ({ open: vi.fn(), overlays: null }),
}));
vi.mock("../book-buddy-read", () => ({
	BookBuddyRead: () => null,
	BUDDY_READ_BLOCKER_TEXT: {},
	StartBuddyReadSheet: () => null,
	shareBlockerFor: () => null,
	useBookBuddyRead: () => null,
}));
vi.mock("../../../contexts/book-sync-context", () => ({
	useBookSync: () => ({ activeBookId: null, isTransferring: false }),
}));
vi.mock("../../../contexts/device-library-context", () => ({
	useBookDeviceState: () => ({ isReachable: false, isOnDevice: false }),
}));
vi.mock("../../../contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: false }),
}));
vi.mock("../../../hooks/use-book-chapters", () => ({
	useBookChapters: () => ({ chapters: [], isResolved: true }),
}));
vi.mock("../../../hooks/use-book-device-actions", () => ({ useBookDeviceActions: () => [] }));
vi.mock("../../../services/db/hooks/use-cloud-storage", () => ({
	useCloudStorage: () => ({ data: undefined }),
}));
vi.mock("../../../services/db/queries", () => ({
	queries: { getHighlightsByBook: async () => [] },
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn(), history: { back: vi.fn(), canGoBack: () => true } }),
	useCanGoBack: () => true,
}));

const { default: BookDetail } = await import("../book-detail");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("BookDetail loading frame", () => {
	it("shows the title, author and a reserved body while the late cards load", async () => {
		state.isReady = false;
		book.current = makeBook({ id: "b1", title: "Middlemarch", author: "George Eliot" });
		view = await render(<BookDetail id="b1" />);
		expect(view.container.querySelector("h1")?.textContent).toBe("Middlemarch");
		expect(view.text()).toContain("George Eliot");
		expect(view.text()).not.toContain("Loading...");
		const reserved = view.container.querySelector<HTMLElement>('[data-testid="reserved-card"]');
		expect(reserved?.style.height).toBe("60vh");
	});

	it("swaps the reserved body for the cards once they are ready, keeping the hero", async () => {
		state.isReady = true;
		book.current = makeBook({ id: "b1", title: "Middlemarch", author: "George Eliot" });
		view = await render(<BookDetail id="b1" />);
		await flush();
		expect(view.container.querySelector("h1")?.textContent).toBe("Middlemarch");
		expect(view.container.querySelector('[data-testid="reserved-card"]')).toBeNull();
	});
});
