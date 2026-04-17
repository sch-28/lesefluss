import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "~/utils/seo";

const urls = [
	{ path: "/", priority: "1.0", changefreq: "weekly" },
	{ path: "/download", priority: "0.9", changefreq: "monthly" },
	{ path: "/device", priority: "0.8", changefreq: "monthly" },
	{ path: "/docs", priority: "0.7", changefreq: "monthly" },
	{ path: "/privacy", priority: "0.3", changefreq: "yearly" },
	{ path: "/terms", priority: "0.3", changefreq: "yearly" },
	{ path: "/imprint", priority: "0.3", changefreq: "yearly" },
];

function buildSitemap(lastmod: string): string {
	const entries = urls
		.map(
			({ path, priority, changefreq }) =>
				`  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () => {
				const lastmod = new Date().toISOString().slice(0, 10);
				return new Response(buildSitemap(lastmod), {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
