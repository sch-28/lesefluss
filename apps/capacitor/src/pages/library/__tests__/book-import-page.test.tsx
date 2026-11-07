import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import {
	createBrowserHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
	useBlocker,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

const commitStagedImport = vi.fn(async (staged: { payload: { title: string } }, _patch: unknown) =>
	makeBook({ title: staged.payload.title }),
);

vi.mock("../../../services/book-import", () => ({
	commitStagedImport: (staged: { payload: { title: string } }, patch: unknown) =>
		commitStagedImport(staged, patch),
	attachOriginalToBook: vi.fn(),
	findAttachCandidate: async () => null,
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: () => {} }));
vi.mock("../../../components/toast", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("../../../services/catalog/client", () => ({ proxyImageUrl: (url: string) => url }));

const { ImportStagingProvider, useImportStaging } = await import(
	"../../../contexts/import-staging-context"
);
const { default: BookImportPage } = await import("../book-import-page");

type Stage = ReturnType<typeof useImportStaging>["stage"];
let stage: Stage;
function StageProbe() {
	stage = useImportStaging().stage;
	return null;
}

const staged = (title: string, cleanup = vi.fn()) => ({
	payload: { title, content: "words", fileFormat: "epub" as const },
	extras: {},
	cleanup,
});

let isEditing = false;
function UnsavedEdit() {
	useBlocker({ shouldBlockFn: () => isEditing });
	return <p>Editing</p>;
}

let rendered: Rendered;
let router: ReturnType<typeof makeRouter>;

function makeRouter() {
	const root = createRootRoute({
		component: () => (
			<ImportStagingProvider>
				<StageProbe />
				<Outlet />
			</ImportStagingProvider>
		),
	});
	const library = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library",
		component: () => <p>Library</p>,
	});
	const importPage = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/import",
		component: BookImportPage,
	});
	const edit = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/stats",
		component: UnsavedEdit,
	});
	window.history.replaceState(null, "", "/tabs/library");
	return createRouter({
		routeTree: root.addChildren([library, importPage, edit]),
		history: createBrowserHistory(),
	});
}

const body = () => document.body.textContent ?? "";
const button = (name: string) => {
	const found = [...document.body.querySelectorAll("button")].find(
		(b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name,
	);
	if (!found) throw new Error(`No button named ${name}`);
	return found;
};
const path = () => router.state.location.pathname;
const titleValue = () => (document.getElementById("book-title") as HTMLInputElement).value;

/** popstate settles a tick after history.back(). */
async function settle() {
	await flush();
	await flush();
}

beforeEach(async () => {
	commitStagedImport.mockClear();
	isEditing = false;
	router = makeRouter();
	rendered = await render(<RouterProvider router={router} />);
	await flush();
});

afterEach(() => rendered.unmount());

describe("BookImportPage", () => {
	it("opens for a staged import and walks the queue: cancel, Android back, then leaves", async () => {
		const first = staged("Red Rising");
		const second = staged("Golden Son");
		await act(async () => {
			stage(first);
			stage(second);
		});
		await settle();

		expect(path()).toBe("/tabs/library/import");
		expect(body()).toContain("1 of 2");
		expect(titleValue()).toBe("Red Rising");

		await click(button("Cancel import"));
		expect(first.cleanup).toHaveBeenCalledOnce();
		expect(body()).toContain("2 of 2");
		expect(titleValue()).toBe("Golden Son");

		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		await settle();
		expect(second.cleanup).toHaveBeenCalledOnce();
		expect(path()).toBe("/tabs/library");
		expect(commitStagedImport).not.toHaveBeenCalled();
	});

	it("adds the book with the reader's edits and returns", async () => {
		const entry = staged("Red Rising");
		await act(async () => stage(entry));
		await settle();

		await click(button("Add to library"));
		await settle();
		expect(commitStagedImport).toHaveBeenCalledWith(
			entry,
			expect.objectContaining({ title: "Red Rising" }),
		);
		expect(entry.cleanup).toHaveBeenCalledOnce();
		expect(path()).toBe("/tabs/library");
	});

	it("drops what is staged when the reader navigates elsewhere", async () => {
		const entry = staged("Red Rising");
		await act(async () => stage(entry));
		await settle();

		await act(async () => router.navigate({ to: "/tabs/library" }));
		await settle();
		expect(entry.cleanup).toHaveBeenCalledOnce();
		expect(path()).toBe("/tabs/library");
	});

	it("still opens a staged import once a page with unsaved edits is left", async () => {
		await act(async () => router.navigate({ to: "/tabs/library/stats" }));
		await settle();
		isEditing = true;
		await act(async () => stage(staged("Red Rising")));
		await settle();
		expect(path()).toBe("/tabs/library/stats");

		isEditing = false;
		await act(async () => router.navigate({ to: "/tabs/library" }));
		await settle();
		expect(path()).toBe("/tabs/library/import");
		expect(titleValue()).toBe("Red Rising");
	});
});
