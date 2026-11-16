import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";
import { NotFound } from "../not-found";
import { PageHeader } from "../page-header";

const onCustomBack = vi.fn();
let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

function makeRouter(entry: string, basepath?: string) {
	const root = createRootRoute({ component: () => <Outlet /> });
	const page = (path: string, header?: React.ReactNode) =>
		createRoute({
			getParentRoute: () => root,
			path,
			component: () => header ?? <p>{path}</p>,
		});
	return createRouter({
		routeTree: root.addChildren([
			page("/tabs/settings"),
			page("/tabs/settings/licenses", <PageHeader title="Licenses" width="text" />),
			page("/tabs/social"),
			page("/tabs/social/buddy-reads"),
			page(
				"/tabs/social/buddy-read/$id",
				<PageHeader title="Buddy read" width="text" backTo="/tabs/social/buddy-reads" />,
			),
			page("/tabs/stats"),
			page("/speed-test", <PageHeader title="Speed test" width="flow" />),
			page("/tabs/library"),
			page(
				"/tabs/library/book/$id/edit",
				<NotFound
					title="Book not found"
					message="This book is no longer in your library."
					backLabel="Back to library"
					backTo="/tabs/library"
				/>,
			),
			page(
				"/tabs/library/all-series",
				<PageHeader title="All series" width="grid" onBack={onCustomBack} />,
			),
		]),
		history: createMemoryHistory({ initialEntries: [entry] }),
		basepath,
	});
}

async function pressBack(router: ReturnType<typeof makeRouter>) {
	rendered = await render(<RouterProvider router={router} />);
	await flush();
	await click(rendered.getButton("Back"));
	await flush();
}

describe("PageHeader Back without in-app history", () => {
	it("goes to the screen's parent instead of leaving the app", async () => {
		const router = makeRouter("/tabs/settings/licenses");
		await pressBack(router);
		expect(router.state.location.pathname).toBe("/tabs/settings");
	});

	it("keeps the /app basepath of the web build", async () => {
		const router = makeRouter("/app/tabs/settings/licenses", "/app");
		await pressBack(router);
		expect(router.state.location.pathname).toBe("/tabs/settings");
		expect(router.history.location.pathname).toBe("/app/tabs/settings");
	});

	it("goes where Android back goes for a cold sub-page with a search", async () => {
		const router = makeRouter("/speed-test");
		await pressBack(router);
		expect(router.state.location.pathname).toBe("/tabs/stats");
		expect(router.state.location.searchStr).toBe("?tab=speed");
	});

	it("uses an explicit backTo, once", async () => {
		const router = makeRouter("/tabs/social/buddy-read/r1");
		await pressBack(router);
		expect(router.state.location.pathname).toBe("/tabs/social/buddy-reads");
		expect(router.history.canGoBack()).toBe(false);
	});

	it("walks history when there is some", async () => {
		const router = makeRouter("/tabs/social");
		await router.navigate({ to: "/tabs/settings/licenses" });
		await pressBack(router);
		expect(router.state.location.pathname).toBe("/tabs/social");
	});
});

describe("NotFound", () => {
	it("says the subject is gone and replaces itself with the way on", async () => {
		const router = makeRouter("/tabs/settings");
		await router.navigate({ to: "/tabs/library/book/$id/edit", params: { id: "gone" } });
		rendered = await render(<RouterProvider router={router} />);
		await flush();
		expect(rendered.text()).toContain("This book is no longer in your library.");
		await click(rendered.getButton("Back to library"));
		await flush();
		expect(router.state.location.pathname).toBe("/tabs/library");
		router.history.back();
		await flush();
		expect(router.state.location.pathname).toBe("/tabs/settings");
	});
});

describe("PageHeader layout", () => {
	it("puts back, title and actions in the page's content column", async () => {
		const router = makeRouter("/tabs/settings/licenses");
		rendered = await render(<RouterProvider router={router} />);
		await flush();
		const row = rendered.getButton("Back").parentElement;
		expect(row?.className).toContain("max-w-[768px]");
		expect(row?.className).toContain("mx-auto");
		expect(row?.querySelector("h1")?.textContent).toBe("Licenses");
	});

	it("runs the page's own Back instead of history", async () => {
		onCustomBack.mockClear();
		const router = makeRouter("/tabs/settings");
		await router.navigate({ to: "/tabs/library/all-series" });
		await pressBack(router);
		expect(onCustomBack).toHaveBeenCalledTimes(1);
		expect(router.state.location.pathname).toBe("/tabs/library/all-series");
	});
});
