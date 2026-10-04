import type { OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { CloudOff, Loader2 } from "lucide-react";
import type React from "react";
import { useSyncContext } from "@/contexts/sync-context";
import { useOwnSocialProfile } from "@/services/social/profile";
import { HandleClaimHero } from "./handle-claim-hero";
import { SignedOutSocial } from "./signed-out";

export function Spinner() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	);
}

/**
 * The list screens sit behind the same gates: session checked, signed in,
 * profile loaded, handle claimed. `children` only renders once all pass. The
 * invite screen composes the same pieces itself because it shows the inviter
 * next to the handle claim.
 */
export function SocialGate({
	children,
	returnTo,
	onClaimed,
}: {
	children: React.ReactNode;
	/** App path (without the web basepath) to come back to after sign-in. */
	returnTo: string;
	onClaimed?: (profile: OwnSocialProfile) => void;
}) {
	const { isLoggedIn, isSessionResolved } = useSyncContext();
	const profile = useOwnSocialProfile(isLoggedIn);

	if (!isSessionResolved) return <Spinner />;
	if (!isLoggedIn) return <SignedOutSocial returnTo={returnTo} />;
	if (profile.isPending) return <Spinner />;
	if (profile.isError && !profile.data) {
		return (
			<OfflineNotice onRetry={() => void profile.refetch()}>
				Can't reach the server. Your social data is only stored online.
			</OfflineNotice>
		);
	}
	if (!profile.data.handle) {
		return <HandleClaimHero profile={profile.data} onClaimed={onClaimed} />;
	}
	return <>{children}</>;
}

/** Above a cached list: says why it may be stale and offers a retry while online. */
export function StaleNotice({
	isOnline,
	isError,
	onRetry,
}: {
	isOnline: boolean;
	isError: boolean;
	onRetry: () => void;
}) {
	if (isOnline && !isError) return null;
	return (
		<div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2 text-muted-foreground text-xs">
			<span>
				{isOnline
					? "Couldn't refresh. Showing the last known items."
					: "You're offline. Showing the last known items; actions are disabled."}
			</span>
			<Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

export function OfflineNotice({
	children,
	onRetry,
}: {
	children: React.ReactNode;
	onRetry?: () => void;
}) {
	return (
		<div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-center">
			<CloudOff className="size-6 text-muted-foreground" />
			<p className="text-muted-foreground text-sm">{children}</p>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			)}
		</div>
	);
}
