import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryHooks } from "@/services/db/hooks";
import { queries } from "@/services/db/queries";
import { launchHasIntent } from "@/services/launch-intent";
import { resolveLaunchRoute } from "@/services/launch-route";

export const Route = createFileRoute("/")({
	component: RootRedirect,
});

// "/" is reachable again after launch (back from the reader pops to it), and
// auto-opening there would trap the user in the book.
let hasAutoOpened = false;

function RootRedirect() {
	const { data: settings, isPending } = queryHooks.useSettings();
	const router = useRouter();
	useEffect(() => {
		if (isPending || !settings) return;
		let cancelled = false;
		const launchSettings = hasAutoOpened ? { ...settings, autoOpenLastBook: false } : settings;
		void resolveLaunchRoute(launchSettings, {
			getLastReadBookId: queries.getLastReadBookId,
			launchHasIntent,
		}).then(async (route) => {
			// A deep link or share intent that navigated away during the lookup wins.
			if (cancelled || router.latestLocation.pathname !== "/") return;
			if (route.to !== "/tabs/reader/$id") {
				router.navigate({ to: route.to, replace: true });
				return;
			}
			hasAutoOpened = true;
			// Library underneath, so back from the reader lands there. Awaited: two
			// navigations in one tick are batched and the replace is lost, leaving
			// "/" under the reader.
			await router.navigate({ to: "/tabs/library", replace: true });
			router.navigate({ to: "/tabs/reader/$id", params: { id: route.bookId } });
		});
		return () => {
			cancelled = true;
		};
	}, [isPending, settings, router]);
	return null;
}
