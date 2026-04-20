import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { auth } from "~/lib/auth";

const DEEP_LINK_SCHEME = "lesefluss://auth-callback";

const getMobileToken = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	const session = await auth.api.getSession({ headers: request.headers });
	return session?.session.token ?? null;
});

function buildDeepLink(token: string, state: string | undefined): string {
	const params = new URLSearchParams({ token });
	if (state) params.set("state", state);
	return `${DEEP_LINK_SCHEME}?${params.toString()}`;
}

export const Route = createFileRoute("/auth/mobile-callback")({
	validateSearch: (search: Record<string, unknown>): { state?: string } =>
		typeof search.state === "string" ? { state: search.state } : {},
	beforeLoad: async ({ search }) => {
		const token = await getMobileToken();
		if (!token) {
			const stateParam = search.state ? `?state=${encodeURIComponent(search.state)}` : "";
			throw redirect({
				to: "/login",
				search: { redirect: `/auth/mobile-callback${stateParam}` },
			});
		}
		return { token, state: search.state };
	},
	loader: ({ context }) => ({ token: context.token, state: context.state }),
	component: MobileCallback,
});

function MobileCallback() {
	const { token, state } = Route.useLoaderData();
	const deepLink = buildDeepLink(token, state);

	React.useEffect(() => {
		window.location.href = deepLink;
	}, [deepLink]);

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm text-center">
				<h1 className="font-bold text-2xl tracking-tight">Returning to Lesefluss…</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					If the app doesn't open automatically, tap the button below.
				</p>
				<Button asChild className="mt-6 w-full" size="lg">
					<a href={deepLink}>Open Lesefluss</a>
				</Button>
			</div>
		</div>
	);
}
