import type { InvitePreview, OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { IdentityCardBox } from "@lesefluss/ui/social-avatar";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { HandleClaimStep } from "@/components/social/handle-claim-step";
import { useSyncContext } from "@/contexts/sync-context";
import { clearPendingLink, setPendingLink } from "@/services/deep-links/pending-link";
import { useIsOnline } from "@/services/social/cache";
import { socialErrorMessage, useInvitePreview, useRedeemInvite } from "@/services/social/friends";
import { useOwnSocialProfile } from "@/services/social/profile";
import { SignedOutSocial } from "./signed-out";
import { OfflineNotice, Spinner } from "./social-gate";

function OwnerCard({ preview }: { preview: InvitePreview }) {
	if (!preview.owner) return null;
	return (
		<IdentityCardBox
			name={preview.owner.name}
			handle={preview.owner.handle}
			avatarUrl={preview.owner.avatarUrl}
		/>
	);
}

function Outcome({
	token,
	preview,
	profile,
}: {
	token: string;
	preview: InvitePreview;
	profile: OwnSocialProfile;
}) {
	const isOnline = useIsOnline();
	const redeem = useRedeemInvite();
	const [error, setError] = useState<string | null>(null);
	const [hasClaimed, setHasClaimed] = useState(false);

	const confirm = () => {
		setError(null);
		redeem.mutate(token, {
			onError: (err) => setError(socialErrorMessage(err)),
		});
	};

	if (preview.state === "handle_required" && !hasClaimed && !profile.handle) {
		return (
			<>
				<h2 className="font-semibold text-xl">You've been invited</h2>
				<OwnerCard preview={preview} />
				<div className="rounded-lg border border-border bg-card p-4 text-left">
					<p className="mb-3 text-muted-foreground text-sm">
						Pick a handle first. It is what your friends will know you by.
					</p>
					<HandleClaimStep profile={profile} onClaimed={() => setHasClaimed(true)} />
				</div>
			</>
		);
	}

	switch (preview.state) {
		case "invalid":
			return (
				<>
					<h2 className="font-semibold text-xl">This invite link is no longer valid</h2>
					<p className="text-muted-foreground text-sm">
						It may have expired or been replaced. Ask your friend for a new one.
					</p>
					<BackToSocial />
				</>
			);
		case "own":
			return (
				<>
					<h2 className="font-semibold text-xl">That's your own invite link</h2>
					<p className="text-muted-foreground text-sm">Share it with someone else to add them.</p>
					<BackToSocial />
				</>
			);
		case "already_friends":
			return (
				<>
					<h2 className="font-semibold text-xl">
						{redeem.isSuccess ? "You're now friends" : "You're already friends"}
					</h2>
					<OwnerCard preview={preview} />
					<BackToSocial />
				</>
			);
		case "handle_required":
		case "valid":
			return (
				<>
					<h2 className="font-semibold text-xl">You've been invited</h2>
					<OwnerCard preview={preview} />
					<p className="text-muted-foreground text-sm">
						Adding them shares your handle, display name and avatar with them.
					</p>
					<Button className="w-full" onClick={confirm} disabled={!isOnline || redeem.isPending}>
						<UserPlus />
						{redeem.isPending ? "Adding…" : "Add friend"}
					</Button>
					{!isOnline && (
						<p className="text-muted-foreground text-xs">
							You're offline. Try again when connected.
						</p>
					)}
					{error && <p className="text-destructive text-sm">{error}</p>}
				</>
			);
		case "signed_out":
			return null;
	}
}

function BackToSocial() {
	const navigate = useNavigate();
	// Replace, not push: back must not return to a finished invite screen.
	return (
		<Button
			variant="outline"
			className="w-full"
			onClick={() => navigate({ to: "/tabs/social", replace: true })}
		>
			Back to Social
		</Button>
	);
}

function InviteContent({ token }: { token: string }) {
	const { isLoggedIn } = useSyncContext();
	const profile = useOwnSocialProfile(isLoggedIn);
	const preview = useInvitePreview(token, isLoggedIn);

	// Signed out: keep the link so it survives the sign-in round trip, which
	// may kill the app on native. Signed in: this screen is the destination,
	// so an older pending link must not replay on top of it.
	useEffect(() => {
		if (isLoggedIn) void clearPendingLink();
		else void setPendingLink({ kind: "invite", token });
	}, [isLoggedIn, token]);

	if (!isLoggedIn) {
		return <SignedOutSocial returnTo={`/tabs/social/invite/${encodeURIComponent(token)}`} />;
	}
	if (profile.isPending || preview.isPending) return <Spinner />;
	if (profile.isError || preview.isError) {
		return (
			<OfflineNotice
				onRetry={() => {
					void profile.refetch();
					void preview.refetch();
				}}
			>
				Can't reach the server to check this invitation.
			</OfflineNotice>
		);
	}
	return (
		<div className="mx-auto mt-4 flex max-w-sm flex-col gap-4 text-center">
			<Outcome token={token} preview={preview.data} profile={profile.data} />
		</div>
	);
}

export default function InvitePage({ token }: { token: string }) {
	return (
		<div className="bg-background">
			<PageHeader title="Invitation" icon={UserPlus} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<InviteContent token={token} />
			</div>
		</div>
	);
}
