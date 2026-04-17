/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import type * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { Header } from "~/components/header";
import { NotFound } from "~/components/NotFound";
import { SiteFlagsContext } from "~/lib/site-flags";
import appCss from "~/styles/app.css?url";
import { buildVerificationMeta, seo } from "~/utils/seo";
import { buildOrganizationSchema, webSiteSchema } from "~/utils/structured-data";

const HIDE_GITHUB = !!process.env.HIDE_GITHUB;

export const Route = createRootRoute({
	loader: () => ({
		hideGithub: HIDE_GITHUB,
	}),
	head: () => {
		const { meta } = seo({
			title: "Lesefluss — Speed Reading App & Device",
			description:
				"Speed reading app for Android. Import EPUB and TXT books, read at up to 1000 WPM, and optionally sync to a pocket-sized ESP32 device.",
		});
		const goatcounter = process.env.GOATCOUNTER_URL;
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
				{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
				{ rel: "manifest", href: "/site.webmanifest" },
			],
			scripts: [
				webSiteSchema,
				buildOrganizationSchema(HIDE_GITHUB),
				...(goatcounter
					? [
							{
								src: `${goatcounter}/count.js`,
								async: true,
								"data-goatcounter": `${goatcounter}/count`,
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

function RootDocument({ children }: { children: React.ReactNode }) {
	const { hideGithub } = Route.useLoaderData();
	return (
		<SiteFlagsContext.Provider value={{ hideGithub }}>
			<html lang="en">
				<head>
					<HeadContent />
				</head>
				<body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
					<Header />
					<main id="main" className="flex flex-1 flex-col">{children}</main>
					<footer className="py-10 text-center text-muted-foreground text-sm">
						<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
							<span>© {new Date().getFullYear()} Lesefluss</span>
							<div className="flex items-center gap-6">
								<Link to="/download" className="transition-colors hover:text-foreground">
									Download
								</Link>
								<a href="/app" className="transition-colors hover:text-foreground">
									Web App
								</a>
								<Link to="/device" className="transition-colors hover:text-foreground">
									Device
								</Link>
								<Link to="/docs" className="transition-colors hover:text-foreground">
									Docs
								</Link>
								<Link to="/privacy" className="transition-colors hover:text-foreground">
									Privacy
								</Link>
								<Link to="/terms" className="transition-colors hover:text-foreground">
									Terms
								</Link>
								<Link to="/imprint" className="transition-colors hover:text-foreground">
									Imprint
								</Link>
								{!hideGithub && (
									<a
										href="https://github.com/sch-28/lesefluss"
										target="_blank"
										rel="noopener noreferrer"
										className="transition-colors hover:text-foreground"
									>
										GitHub
									</a>
								)}
							</div>
						</div>
					</footer>
					<Scripts />
				</body>
			</html>
		</SiteFlagsContext.Provider>
	);
}
