import type { InvitePreview, OwnSocialProfile } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { IdentityCardBox } from "@lesefluss/ui/social-avatar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { InviteAppCallToAction } from "~/components/invite-app-cta";
import { HandleClaimForm, PROFILE_KEY } from "~/components/social-profile-section";
import { previewInviteForPage } from "~/lib/invite-page";
import { friendsClient, socialClient } from "~/lib/social-client";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/invite/$token")({
	loader: ({ params }) => previewInviteForPage({ data: { token: params.token } }),
	head: () => seo({ title: "Invitation - Lesefluss", isNoindex: true }),
	component: InvitePage,
});

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm space-y-6 text-center">
				<h1 className="font-bold text-2xl tracking-tight">{title}</h1>
				{children}
			</div>
		</div>
	);
}

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
			<Button onClick={redeem} disabled={isPending} className="w-full">
				{isPending ? "Adding…" : "Add friend"}
			</Button>
			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}

function InvitePage() {
	const initial = Route.useLoaderData();
	const { token } = Route.useParams();
	const [preview, setPreview] = React.useState<InvitePreview>(initial);
	const [justAdded, setJustAdded] = React.useState(false);
	const onDone = (p: InvitePreview) => {
		setJustAdded(p.state === "already_friends");
		setPreview(p);
	};

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
				<Shell title={justAdded ? "You're now friends" : "You're already friends"}>
					<OwnerCard preview={preview} />
					<InviteAppCallToAction token={token} />
				</Shell>
			);
		case "signed_out":
			return (
				<Shell title="You've been invited">
					<OwnerCard preview={preview} />
					<p className="text-muted-foreground text-sm">Sign in or create an account to add them.</p>
					<InviteAppCallToAction token={token} />
					<Button asChild className="w-full">
						<Link to="/login" search={{ redirect: `/invite/${token}` }}>
							Sign in
						</Link>
					</Button>
				</Shell>
			);
		case "handle_required":
			return (
				<Shell title="You've been invited">
					<OwnerCard preview={preview} />
					<ClaimThenConfirm token={token} onDone={onDone} />
					<InviteAppCallToAction token={token} />
				</Shell>
			);
		case "valid":
			return (
				<Shell title="You've been invited">
					<OwnerCard preview={preview} />
					<p className="text-muted-foreground text-sm">
						Adding them shares your handle, display name and avatar with them.
					</p>
					<Confirm token={token} onDone={onDone} />
					<InviteAppCallToAction token={token} />
				</Shell>
			);
	}
}
