import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

type InitOptions = { claim?: boolean; onWaiting?: () => void };

const db = vi.hoisted(() => ({
	starts: [] as Array<{
		options: InitOptions;
		resolve: () => void;
		reject: (err: Error) => void;
	}>,
	moved: new Set<() => void>(),
	deleteOrphanedContentRows: vi.fn(async () => 0),
}));

vi.mock("../../services/db", () => ({
	initDb: (options: InitOptions) =>
		new Promise<void>((resolve, reject) => db.starts.push({ options, resolve, reject })),
	onDbMoved: (listener: () => void) => {
		db.moved.add(listener);
		return () => db.moved.delete(listener);
	},
	resetAppData: vi.fn(),
}));
vi.mock("../../services/db/queries", () => ({
	queries: {
		cleanupOrphanedChapterRows: async () => 0,
		deleteOrphanedContentRows: db.deleteOrphanedContentRows,
		backfillWordCounts: async () => 0,
	},
}));

const { DatabaseProvider } = await import("../database-context");

function failure(name: string): Error {
	const err = new Error(name);
	err.name = name;
	return err;
}

async function settle(fn: () => void) {
	await act(async () => {
		fn();
		await Promise.resolve();
	});
}

let view: Rendered | undefined;

beforeEach(() => {
	db.starts = [];
	db.moved.clear();
	sessionStorage.clear();
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function renderApp() {
	view = await render(
		<DatabaseProvider>
			<p>Library</p>
		</DatabaseProvider>,
	);
	return view;
}

const lastStart = () => {
	const start = db.starts.at(-1);
	if (!start) throw new Error("initDb was not called");
	return start;
};

describe("DatabaseProvider", () => {
	it("shows the app once the library opened", async () => {
		const { text } = await renderApp();
		await settle(() => lastStart().resolve());
		await vi.waitFor(() => expect(text()).toContain("Library"));
		expect(db.deleteOrphanedContentRows).toHaveBeenCalled();
	});

	it("shows the wait only after a moment, then the app", async () => {
		vi.useFakeTimers();
		const { text } = await renderApp();
		await settle(() => lastStart().options.onWaiting?.());
		expect(text()).toBe("");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(299);
		});
		expect(text()).toBe("");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(text()).toContain("Opening your library");

		await settle(() => lastStart().resolve());
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(text()).toContain("Library");
	});

	it("offers to use the library here when another tab holds it, and claims it", async () => {
		const { text, getButton } = await renderApp();
		await settle(() => lastStart().reject(failure("DbInUseError")));
		expect(text()).toContain("Lesefluss is open in another tab");

		await settle(() => getButton("Use it here").click());
		expect(lastStart().options.claim).toBe(true);
		await settle(() => lastStart().resolve());
		await vi.waitFor(() => expect(text()).toContain("Library"));
	});

	it("treats storage still busy after the wait like another tab", async () => {
		const { text } = await renderApp();
		await settle(() => lastStart().reject(failure("StorageBusyError")));
		expect(text()).toContain("Lesefluss is open in another tab");
	});

	it("explains what to do when no storage works, and tries again", async () => {
		const { text, getButton } = await renderApp();
		await settle(() => lastStart().reject(failure("StorageUnavailableError")));
		expect(text()).toContain("This window can't keep your library");
		expect(text()).toContain("Open Lesefluss in a normal window");

		await settle(() => getButton("Try again").click());
		expect(db.starts).toHaveLength(2);
		expect(lastStart().options.claim).toBe(false);
	});

	it("keeps the reset screen for other failures", async () => {
		const { getButton } = await renderApp();
		await settle(() => lastStart().reject(new Error("migration failed")));
		expect(getButton("Reset app data")).toBeTruthy();
	});

	it("pauses when another tab takes the library, and takes it back by reloading with a claim", async () => {
		const reload = vi.fn();
		vi.spyOn(window, "location", "get").mockReturnValue({
			...window.location,
			reload,
		} as Location);
		const { text, getButton } = await renderApp();
		await settle(() => lastStart().resolve());
		await vi.waitFor(() => expect(text()).toContain("Library"));

		await settle(() => {
			for (const listener of db.moved) listener();
		});
		expect(text()).toContain("Lesefluss is now open in another tab");
		expect(text()).not.toContain("Library");

		await settle(() => getButton("Use it here again").click());
		expect(reload).toHaveBeenCalled();
		expect(sessionStorage.getItem("lesefluss:claim-db")).toBe("1");
	});

	it("stays paused when another tab takes the library before this tab finished starting", async () => {
		const { text } = await renderApp();
		await settle(() => {
			for (const listener of db.moved) listener();
		});
		await settle(() => lastStart().resolve());
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(text()).toContain("Lesefluss is now open in another tab");
		expect(text()).not.toContain("Library");
	});

	it("a start after that reload claims the library and clears the flag", async () => {
		sessionStorage.setItem("lesefluss:claim-db", "1");
		await renderApp();
		expect(lastStart().options.claim).toBe(true);
		expect(sessionStorage.getItem("lesefluss:claim-db")).toBeNull();
	});
});
