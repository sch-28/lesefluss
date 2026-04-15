/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import type * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { Header } from "~/components/header";
import { NotFound } from "~/components/NotFound";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			...seo({
				title: "Lesefluss — Speed Reading App & Device",
				description:
					"Speed reading app for Android. Import EPUB and TXT books, read at up to 1000 WPM, and optionally sync to a pocket-sized ESP32 device.",
			}),
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.ico" },
		],
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground antialiased">
				<Header />
				<main>{children}</main>
				<footer className="py-10 text-center text-muted-foreground text-sm">
					<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
						<span>© {new Date().getFullYear()} Lesefluss</span>
						<div className="flex items-center gap-6">
							<Link to="/download" className="transition-colors hover:text-foreground">
								Download
							</Link>
							<Link to="/app" className="transition-colors hover:text-foreground">
								Web App
							</Link>
							<Link to="/device" className="transition-colors hover:text-foreground">
								Device
							</Link>
							<Link to="/docs" className="transition-colors hover:text-foreground">
								Docs
							</Link>
							<a
								href="https://github.com/sch-28/lesefluss"
								target="_blank"
								rel="noopener noreferrer"
								className="transition-colors hover:text-foreground"
							>
								GitHub
							</a>
						</div>
					</div>
				</footer>
				<Scripts />
			</body>
		</html>
	);
}
