import { createFileRoute } from "@tanstack/react-router";
import { isAppFilePath } from "~/lib/app-file-path";
import { getSpaHtml } from "~/lib/spa-html";

export const Route = createFileRoute("/app/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Real files are answered by the static file server before this route.
				if (isAppFilePath(new URL(request.url).pathname)) {
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
