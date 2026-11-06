import { createFileRoute } from "@tanstack/react-router";
import { getSpaHtml } from "~/lib/spa-html";

export const Route = createFileRoute("/app/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Real assets are answered by the static file server before this route. A
				// missing one answered with the shell would run as a script of HTML in a tab
				// still on the previous build.
				if (new URL(request.url).pathname.startsWith("/app/assets/")) {
					return new Response("Not found", {
						status: 404,
						headers: { "Content-Type": "text/plain; charset=utf-8" },
					});
				}
				return new Response(getSpaHtml(), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			},
		},
	},
});
