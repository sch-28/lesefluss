import type { SocialIdentity } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyRow, Section } from "@/components/app-shell/section";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { useIsOnline } from "@/services/social/cache";
import { socialErrorMessage, useRelationships, useUnblockUser } from "@/services/social/friends";
import { PersonRow } from "./person-row";
import { OfflineNotice, SocialGate, Spinner } from "./social-gate";

function BlockedContent() {
	const isOnline = useIsOnline();
	const relationships = useRelationships();
	const unblock = useUnblockUser();
	const [target, setTarget] = useState<SocialIdentity | null>(null);

	if (relationships.isPending) return <Spinner />;
	if (relationships.isError && !relationships.data) {
		return (
			<OfflineNotice onRetry={() => void relationships.refetch()}>
				Couldn't load your blocked users.
			</OfflineNotice>
		);
	}
	const blocked = relationships.data.blocked;
	return (
		<>
			<Section title="Blocked users">
				{blocked.length === 0 ? (
					<EmptyRow>You haven't blocked anyone.</EmptyRow>
				) : (
					blocked.map((person) => (
						<PersonRow
							key={person.userId}
							person={person}
							trailing={
								<Button
									size="sm"
									variant="outline"
									disabled={!isOnline || unblock.isPending}
									onClick={() => setTarget(person)}
								>
									Unblock
								</Button>
							}
						/>
					))
				)}
			</Section>
			<p className="px-4 pt-3 text-muted-foreground text-xs">
				Only you can see this list. Unblocking does not restore a friendship or any request.
			</p>
			<ConfirmDialog
				open={target !== null}
				onOpenChange={(open) => !open && setTarget(null)}
				title={target ? `Unblock ${target.name}?` : ""}
				description="They can interact with you again through invites and shared buddy reads. They are not notified."
				confirmLabel="Unblock"
				onConfirm={() => {
					if (target) {
						unblock.mutate(target.userId, {
							onError: (err) => toast.error(socialErrorMessage(err)),
						});
					}
				}}
			/>
		</>
	);
}

export default function BlockedUsersPage() {
	return (
		<div className="bg-background">
			<PageHeader title="Blocked users" icon={ShieldOff} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social/blocked">
					<BlockedContent />
				</SocialGate>
			</div>
		</div>
	);
}
