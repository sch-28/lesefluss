/// <reference types="vite/client" />

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Link, Scripts, useRouter } from "@tanstack/react-router";
import { Coffee, MessageCircle, Star } from "lucide-react";
import * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { Header } from "~/components/header";
import { NotFound } from "~/components/NotFound";
import { getSession } from "~/lib/get-session";
import appCss from "~/styles/app.css?url";
import { buildVerificationMeta, seo } from "~/utils/seo";
import { buildOrganizationSchema, webSiteSchema } from "~/utils/structured-data";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 0 } } });

export const Route = createRootRoute({
	beforeLoad: async () => ({ session: await getSession() }),
	loader: () => ({}),
	head: () => {
		const { meta } = seo({
			title: "Lesefluss - Speed Reading App & Device",
			description:
				"Speed reading app for Android. Import EPUB and TXT books, read at up to 1000 WPM, and optionally sync to a pocket-sized ESP32 device.",
		});
		const umamiUrl = process.env.UMAMI_URL;
		const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;
		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "theme-color", content: "#ffffff" },
				...buildVerificationMeta(),
				...meta,
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", href: "/favicon.png", type: "image/png" },
				{ rel: "icon", href: "/favicon.ico", sizes: "any" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
				{ rel: "manifest", href: "/site.webmanifest" },
			],
			scripts: [
				webSiteSchema,
				buildOrganizationSchema(),
				...(umamiUrl && umamiWebsiteId
					? [
							{
								src: `${umamiUrl}/script.js`,
								defer: true,
								"data-website-id": umamiWebsiteId,
							},
						]
					: []),
			],
		};
	},
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
});

declare global {
	interface Window {
		umami?: {
			track(props?: { url: string; title: string }): void;
			track(event: string, data?: Record<string, unknown>): void;
		};
	}
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const router = useRouter();

	React.useEffect(() => {
		let mounted = false;
		return router.subscribe("onLoad", () => {
			if (!mounted) {
				mounted = true;
				return;
			}
			window.umami?.track({ url: window.location.pathname, title: document.title });
		});
	}, [router]);

	return (
		<QueryClientProvider client={queryClient}>
			<html lang="en">
				<head>
					<HeadContent />
				</head>
				<body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
					<Header />
					<main id="main" className="flex flex-1 flex-col">
						{children}
					</main>
					<footer className="mt-16 border-border/60 border-t text-muted-foreground text-sm">
						<div className="mx-auto max-w-5xl px-6 py-12">
							<div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
								<div className="space-y-3">
									<Link
										to="/"
										className="flex items-center gap-2 font-semibold text-base text-foreground tracking-tight"
									>
										<img src="/logo.png" alt="" className="size-6 rounded-md" />
										Lesefluss
									</Link>
									<p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
										Speed reading for your phone and a pocket-sized ESP32 device.
									</p>
								</div>
								<div className="space-y-3">
									<h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">
										Product
									</h3>
									<ul className="space-y-2">
										<li>
											<Link to="/download" className="transition-colors hover:text-foreground">
												Download
											</Link>
										</li>
										<li>
											<a href="/app" className="transition-colors hover:text-foreground">
												Web App
											</a>
										</li>
										<li>
											<Link to="/device" className="transition-colors hover:text-foreground">
												Device
											</Link>
										</li>
									</ul>
								</div>
								<div className="space-y-3">
									<h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">
										Resources
									</h3>
									<ul className="space-y-2">
										<li>
											<Link to="/docs" className="transition-colors hover:text-foreground">
												Docs
											</Link>
										</li>
										<li>
											<Link to="/changelog" className="transition-colors hover:text-foreground">
												Changelog
											</Link>
										</li>
										<li>
											<Link to="/feedback" className="transition-colors hover:text-foreground">
												Feedback
											</Link>
										</li>
										<li>
											<a
												href="https://github.com/sch-28/lesefluss"
												target="_blank"
												rel="noopener noreferrer"
												className="transition-colors hover:text-foreground"
											>
												GitHub
											</a>
										</li>
										<li>
											<a
												href="https://discord.gg/A4rDBgjJ3V"
												target="_blank"
												rel="noopener noreferrer"
												className="transition-colors hover:text-foreground"
											>
												Discord
											</a>
										</li>
									</ul>
								</div>
								<div className="space-y-3">
									<h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">
										Legal
									</h3>
									<ul className="space-y-2">
										<li>
											<Link to="/privacy" className="transition-colors hover:text-foreground">
												Privacy
											</Link>
										</li>
										<li>
											<Link to="/terms" className="transition-colors hover:text-foreground">
												Terms
											</Link>
										</li>
										<li>
											<Link to="/imprint" className="transition-colors hover:text-foreground">
												Imprint
											</Link>
										</li>
									</ul>
								</div>
							</div>
							<div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-border/60 border-t pt-6 text-muted-foreground/80 text-xs">
								<span>© {new Date().getFullYear()} Lesefluss. All rights reserved.</span>
								<div className="flex items-center gap-4">
									<a
										href="https://github.com/sch-28/lesefluss"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
									>
										<Star className="h-3.5 w-3.5" />
										Star on GitHub
									</a>
									<a
										href="https://discord.gg/A4rDBgjJ3V"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
									>
										<MessageCircle className="h-3.5 w-3.5" />
										Join the Discord
									</a>
									<a
										href="https://ko-fi.com/sch28"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
									>
										<Coffee className="h-3.5 w-3.5" />
										Buy me a coffee
									</a>
								</div>
							</div>
						</div>
					</footer>
					<Scripts />
				</body>
			</html>
		</QueryClientProvider>
	);
}
