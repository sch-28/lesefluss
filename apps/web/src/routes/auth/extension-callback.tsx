import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { isAllowedExtensionRedirectUri } from "~/lib/allowed-origins";
import { auth } from "~/lib/auth";
import { seo } from "~/utils/seo";

const getExtensionToken = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	const session = await auth.api.getSession({ headers: request.headers });
	return session?.session.token ?? null;
});

function buildCallbackUrl(redirectUri: string, token: string, state: string | undefined): string {
	const url = new URL(redirectUri);
	const params = new URLSearchParams({ token });
	if (state) params.set("state", state);
	url.hash = params.toString();
	return url.toString();
}

function buildRouteSearch(redirectUri: string, state: string | undefined): string {
	const params = new URLSearchParams({ redirect_uri: redirectUri });
	if (state) params.set("state", state);
	return `/auth/extension-callback?${params.toString()}`;
}

export const Route = createFileRoute("/auth/extension-callback")({
	head: () =>
		seo({
			title: "Returning to Lesefluss Extension",
			isNoindex: true,
		}),
	validateSearch: (
		search: Record<string, unknown>,
	): { redirectUri: string | null; state?: string } => ({
		redirectUri: typeof search.redirect_uri === "string" ? search.redirect_uri : null,
		...(typeof search.state === "string" ? { state: search.state } : {}),
	}),
	beforeLoad: async ({ search }) => {
		if (!search.redirectUri || !isAllowedExtensionRedirectUri(search.redirectUri)) {
			return { kind: "error" as const };
		}

		const token = await getExtensionToken();
		if (!token) {
			throw redirect({
				to: "/login",
				search: { redirect: buildRouteSearch(search.redirectUri, search.state) },
			});
		}
		return {
			kind: "ok" as const,
			redirectUri: search.redirectUri,
			state: search.state,
			token,
		};
	},
	loader: ({ context }) => context,
	component: ExtensionCallback,
});

function ExtensionCallback() {
	const data = Route.useLoaderData();
	const callbackUrl =
		data.kind === "ok" ? buildCallbackUrl(data.redirectUri, data.token, data.state) : undefined;

	React.useEffect(() => {
		if (callbackUrl) window.location.href = callbackUrl;
	}, [callbackUrl]);

	if (data.kind === "error") {
		return (
			<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
				<div className="w-full max-w-sm text-center">
					<h1 className="font-bold text-2xl tracking-tight">Sign-in could not continue</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						The extension's redirect URI was not recognised by this server. Make sure the
						extension's published ID is on the allowlist.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm text-center">
				<h1 className="font-bold text-2xl tracking-tight">Returning to Lesefluss…</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					If the extension doesn't continue automatically, tap the button below.
				</p>
				<Button asChild className="mt-6 w-full" size="lg">
					<a href={callbackUrl}>Continue sign-in</a>
				</Button>
			</div>
		</div>
	);
}
