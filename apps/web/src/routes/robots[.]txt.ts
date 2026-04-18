import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "~/utils/seo";

const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /app/
Disallow: /diy
Disallow: /order
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(body, {
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				}),
		},
	},
});
