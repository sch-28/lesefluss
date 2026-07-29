import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const basepath = import.meta.env.VITE_WEB_BUILD === "true" ? "/app" : undefined;

export const router = createRouter({
	routeTree,
	basepath,
	defaultPreload: "intent",
	scrollRestoration: true,
	// Body scroll is disabled, so the default `window.scrollTo(0, 0)` on a
	// forward navigation reaches nothing and the shared container keeps the
	// previous route's offset. Only runs when nothing was restored, so back
	// navigation still lands where it left off.
	scrollToTopSelectors: ['[data-scroll-restoration-id="app-scroll"]'],
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
