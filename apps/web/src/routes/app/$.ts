import { createFileRoute } from "@tanstack/react-router";
import { getSpaHtml } from "~/lib/spa-html";

export const Route = createFileRoute("/app/$")({
	server: {
		handlers: {
			GET: async () => {
				return new Response(getSpaHtml(), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			},
		},
	},
});
