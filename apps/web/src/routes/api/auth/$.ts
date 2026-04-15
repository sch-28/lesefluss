import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth";
import { cors } from "~/lib/cors-middleware";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		middleware: [cors],
		handlers: {
			GET: ({ request }: { request: Request }) => auth.handler(request),
			POST: ({ request }: { request: Request }) => auth.handler(request),
		},
	},
});
