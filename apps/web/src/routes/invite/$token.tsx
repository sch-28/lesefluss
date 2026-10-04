import type { InvitePreview, OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { CoverLitBuddyCard } from "~/components/cover-lit-buddy-card";
import { GooglePlayBadge } from "~/components/google-play-badge";
import { InviteAppCallToAction } from "~/components/invite-app-cta";
import { HandleClaimForm, PROFILE_KEY } from "~/components/social-profile-section";
import { previewInviteForPage } from "~/lib/invite-page";
import { friendsClient, socialClient } from "~/lib/social-client";
import { appInviteIntentUrl } from "~/lib/store-links";
import { useIsAndroid } from "~/lib/use-is-android";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/invite/$token")({
	loader: ({ params }) => previewInviteForPage({ data: { token: params.token } }),
	head: () => seo({ title: "Invitation - Lesefluss", isNoindex: true }),
	component: InvitePage,
});

function Shell({
	title,
	owner,
	children,
	after,
}: {
	title: string;
	owner?: InvitePreview["owner"];
	children?: React.ReactNode;
	after?: React.ReactNode;
}) {
	return (
		<div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
			<div className="relative">
				<div
					aria-hidden="true"
					className="absolute inset-0 rounded-full bg-primary/10"
					style={{ filter: "blur(60px)", transform: "scale(1.2)" }}
				/>
				<CoverLitBuddyCard isAboveFold>
					<div className="mt-6 space-y-4 px-1">
						{owner && (
							<div className="flex items-center gap-3">
								<SocialAvatar name={owner.name} avatarUrl={owner.avatarUrl} />
								<div className="min-w-0 text-sm">
									<div className="truncate font-semibold text-foreground">{owner.name}</div>
									<div className="truncate text-muted-foreground">@{owner.handle}</div>
								</div>
							</div>
						)}
						<h1 className="font-bold text-[26px] text-foreground leading-tight tracking-tight">
							{title}
						</h1>
						{children}
					</div>
				</CoverLitBuddyCard>
			</div>
			{after}
		</div>
	);
}

function ClaimThenConfirm({
	token,
	onDone,
}: {
	token: string;
	onDone: (p: InvitePreview) => void;
}) {
	const profile = useQuery({
		queryKey: PROFILE_KEY,
		queryFn: socialClient.getOwnProfile,
		retry: 1,
	});
	const [claimed, setClaimed] = React.useState<OwnSocialProfile | null>(null);
	if (claimed) return <Confirm token={token} onDone={onDone} />;
	if (profile.isPending) return <p className="text-muted-foreground text-sm">Loading…</p>;
	if (profile.isError) {
		return (
			<p className="text-muted-foreground text-sm">Couldn't load your profile. Reload to retry.</p>
		);
	}
	return (
		<div className="space-y-4 text-left">
			<p className="text-muted-foreground text-sm">
				Pick a handle first. It is what your friends will know you by.
			</p>
			<HandleClaimForm profile={profile.data} onDone={setClaimed} />
		</div>
	);
}

function Confirm({ token, onDone }: { token: string; onDone: (p: InvitePreview) => void }) {
	const [isPending, setIsPending] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const redeem = async () => {
		setIsPending(true);
		setError(null);
		try {
			onDone(await friendsClient.redeemInvite(token));
		} catch {
			setError("Something went wrong. Please try again.");
			setIsPending(false);
		}
	};
	return (
		<div className="space-y-3">
			<Button onClick={redeem} disabled={isPending} className="h-12 w-full rounded-xl text-[15px]">
				{isPending ? "Adding…" : "Add friend"}
			</Button>
			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}

function InvitePage() {
	const initial = Route.useLoaderData();
	const { token } = Route.useParams();
	const isAndroid = useIsAndroid();
	const [preview, setPreview] = React.useState<InvitePreview>(initial);
	const [justAdded, setJustAdded] = React.useState(false);
	const onDone = (p: InvitePreview) => {
		setJustAdded(p.state === "already_friends");
		setPreview(p);
	};
	const getTheApp = <InviteAppCallToAction token={token} />;

	switch (preview.state) {
		case "invalid":
			return (
				<Shell title="This invitation is no longer valid">
					<p className="text-muted-foreground text-sm">
						The link may have expired or been replaced. Ask your friend for a new one.
					</p>
				</Shell>
			);
		case "own":
			return (
				<Shell title="That's your own invite link">
					<p className="text-muted-foreground text-sm">Share it with someone else to add them.</p>
				</Shell>
			);
		case "already_friends":
			return (
				<Shell
					title={justAdded ? "You're now friends" : "You're already friends"}
					owner={preview.owner}
					after={
						<div className="mt-6 space-y-3 px-1 text-center">
							<p className="text-muted-foreground text-sm">
								No app yet? Your friends are waiting in it once you sign in.
							</p>
							<GooglePlayBadge className="w-full justify-center" />
						</div>
					}
				>
					<p className="text-muted-foreground text-sm">
						Pick a book together and follow each other's progress in Lesefluss.
					</p>
					<Button asChild className="h-12 w-full rounded-xl text-[15px]">
						{isAndroid ? (
							<a href={appInviteIntentUrl(token)}>Open Lesefluss</a>
						) : (
							<a href="/app/tabs/social">Open the web app</a>
						)}
					</Button>
					{isAndroid && (
						<Button asChild variant="ghost" size="sm" className="w-full">
							<a href="/app/tabs/social">Open the web app</a>
						</Button>
					)}
				</Shell>
			);
		case "signed_out":
			return (
				<Shell title="You've been invited" owner={preview.owner} after={getTheApp}>
					<p className="text-muted-foreground text-sm">
						Read the same book together and see where everyone is. Sign in or create an account to
						add them.
					</p>
					<Button asChild className="h-12 w-full rounded-xl text-[15px]">
						<Link to="/login" search={{ redirect: `/invite/${token}` }}>
							Sign in
						</Link>
					</Button>
				</Shell>
			);
		case "handle_required":
			return (
				<Shell title="You've been invited" owner={preview.owner} after={getTheApp}>
					<ClaimThenConfirm token={token} onDone={onDone} />
				</Shell>
			);
		case "valid":
			return (
				<Shell title="You've been invited" owner={preview.owner} after={getTheApp}>
					<p className="text-muted-foreground text-sm">
						Adding them shares your handle, display name and avatar with them.
					</p>
					<Confirm token={token} onDone={onDone} />
				</Shell>
			);
	}
}
