import type { OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { CloudOff, Loader2, Users } from "lucide-react";
import type React from "react";
import { HandleClaimStep } from "@/components/social/handle-claim-step";
import { useSyncContext } from "@/contexts/sync-context";
import { useOwnSocialProfile } from "@/services/social/profile";
import { SignedOutSocial } from "./signed-out";

export function Spinner() {
	return (
		<div className="flex justify-center py-16">
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	);
}

/**
 * The list screens sit behind the same three gates: signed in, profile
 * loaded, handle claimed. `children` only renders once all three pass. The
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
	const { isLoggedIn } = useSyncContext();
	const profile = useOwnSocialProfile(isLoggedIn);

	if (!isLoggedIn) return <SignedOutSocial returnTo={returnTo} />;
	if (profile.isPending) return <Spinner />;
	if (profile.isError) {
		return (
			<OfflineNotice onRetry={() => void profile.refetch()}>
				Can't reach the server. Your social data is only stored online.
			</OfflineNotice>
		);
	}
	if (!profile.data.handle) {
		return (
			<div className="mx-auto mt-2 max-w-2xl rounded-lg border border-border bg-card p-4">
				<div className="mb-4 flex items-center gap-3">
					<Users className="size-6 text-primary" />
					<div>
						<h2 className="font-semibold text-base text-foreground">Pick a handle</h2>
						<p className="text-muted-foreground text-sm">
							Friends will know you by it. Nobody can see you until you confirm.
						</p>
					</div>
				</div>
				<HandleClaimStep profile={profile.data} onClaimed={onClaimed} />
			</div>
		);
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
