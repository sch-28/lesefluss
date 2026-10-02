import type { Settings } from "./db/schema";

type LaunchRoute =
	| { to: "/onboarding" }
	| { to: "/tabs/library" }
	| { to: "/tabs/reader/$id"; bookId: string };

export type LaunchRouteDeps = {
	getLastReadBookId: () => Promise<string | null>;
	/** True when a deep link, auth callback or share started the app; that flow owns navigation. */
	launchHasIntent: () => Promise<boolean>;
};

/** Where a cold start at `/` lands. A failed lookup falls back to the library, never blocks launch. */
export async function resolveLaunchRoute(
	settings: Pick<Settings, "onboardingCompleted" | "autoOpenLastBook">,
	deps: LaunchRouteDeps,
): Promise<LaunchRoute> {
	if (!settings.onboardingCompleted) return { to: "/onboarding" };
	if (!settings.autoOpenLastBook) return { to: "/tabs/library" };
	if (await deps.launchHasIntent().catch(() => false)) return { to: "/tabs/library" };
	const bookId = await deps.getLastReadBookId().catch(() => null);
	return bookId ? { to: "/tabs/reader/$id", bookId } : { to: "/tabs/library" };
}
