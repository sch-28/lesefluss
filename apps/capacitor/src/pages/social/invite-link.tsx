import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { Copy, Link2, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Section } from "@/components/app-shell/section";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PasteInviteField } from "@/components/social/paste-invite-field";
import { toast } from "@/components/toast";
import { useIsOnline } from "@/services/social/cache";
import {
	socialErrorMessage,
	useCreateInvite,
	useCurrentInvite,
	useRevokeInvite,
} from "@/services/social/friends";
import { copyToClipboard } from "@/utils/clipboard";
import { OfflineNotice, SocialGate, Spinner } from "./social-gate";

function formatExpiry(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

let hasAutoCreatedInvite = false;

function InviteLinkContent() {
	const isOnline = useIsOnline();
	const invite = useCurrentInvite();
	const create = useCreateInvite();
	const revoke = useRevokeInvite();
	const [confirm, setConfirm] = useState<"replace" | "revoke" | null>(null);
	const isBusy = !isOnline || create.isPending || revoke.isPending;
	const onError = (err: unknown) => toast.error(socialErrorMessage(err));

	// Creating replaces any existing link, so only on a successful fresh fetch, and once
	// per app session so a revoked link stays revoked and remounts don't burn the rate limit.
	const hasNoLink =
		invite.isFetchedAfterMount && !invite.isFetching && !invite.isError && invite.data === null;
	useEffect(() => {
		if (!hasNoLink || !isOnline || hasAutoCreatedInvite) return;
		hasAutoCreatedInvite = true;
		create.mutate(undefined, { onError });
	});

	const copy = async (url: string) => {
		if (await copyToClipboard(url)) toast.success("Link copied");
		else toast.error("Couldn't copy the link");
	};
	const share = async (url: string) => {
		if (!Capacitor.isNativePlatform()) return copy(url);
		await Share.share({
			title: "Join me on Lesefluss",
			text: "Add me as a friend on Lesefluss:",
			url,
			dialogTitle: "Share invite link",
		}).catch(() => {});
	};

	if (invite.isPending) return <Spinner />;
	if (invite.isError && invite.data === undefined) {
		return (
			<OfflineNotice onRetry={() => void invite.refetch()}>
				Couldn't load your invite link.
			</OfflineNotice>
		);
	}
	const current = invite.data ?? null;

	return (
		<>
			<Section title="Your invite link">
				<div className="space-y-3 px-4 py-4">
					<p className="text-muted-foreground text-sm">
						Anyone who opens this link can become your friend until it expires or you revoke it.
						Share it only with people you want as friends.
					</p>
					{current ? (
						<>
							<Input
								readOnly
								value={current.url}
								aria-label="Your invite link"
								onFocus={(e) => e.currentTarget.select()}
							/>
							<p className="text-muted-foreground text-xs">
								Expires on {formatExpiry(current.expiresAt)}.
							</p>
							<div className="flex flex-wrap gap-2">
								<Button size="sm" onClick={() => share(current.url)}>
									<Share2 /> Share
								</Button>
								<Button size="sm" variant="outline" onClick={() => copy(current.url)}>
									<Copy /> Copy
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={isBusy}
									onClick={() => setConfirm("replace")}
								>
									<Link2 /> New link
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={isBusy}
									onClick={() => setConfirm("revoke")}
								>
									<Trash2 /> Revoke
								</Button>
							</div>
						</>
					) : (
						<Button
							className="w-full"
							disabled={isBusy}
							onClick={() => create.mutate(undefined, { onError })}
						>
							{create.isPending ? "Creating…" : "Create invite link"}
						</Button>
					)}
				</div>
			</Section>

			<Section title="Got a link?">
				<div className="space-y-2 px-4 py-4">
					<p className="text-muted-foreground text-sm">
						Paste an invite link a friend sent you to add them.
					</p>
					<PasteInviteField />
				</div>
			</Section>

			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title={confirm === "replace" ? "Create a new link?" : "Revoke your invite link?"}
				description={
					confirm === "replace"
						? "Your current link stops working. Anyone who still has it can no longer use it."
						: "Nobody can use this link any more. You can create a new one at any time."
				}
				confirmLabel={confirm === "replace" ? "Create new link" : "Revoke"}
				destructive={confirm === "revoke"}
				onConfirm={() =>
					confirm === "replace"
						? create.mutate(undefined, { onError })
						: revoke.mutate(undefined, { onError })
				}
			/>
		</>
	);
}

export default function InviteLinkPage() {
	return (
		<div className="bg-background">
			<PageHeader title="Add friend" icon={Link2} backTo="/tabs/social" />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social/invite-link">
					<InviteLinkContent />
				</SocialGate>
			</div>
		</div>
	);
}
