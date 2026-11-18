import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { CARD_SURFACE } from "@/components/card";
import { PageBody } from "@/components/page-body";
import { BuddyReadCard } from "@/components/social/buddy-read-card";
import { SECTION_ACTION, SocialSection } from "@/components/social/social-ui";
import { StartBuddyReadPicker } from "@/components/social/start-buddy-read-picker";
import { useBuddyReads } from "@/services/social/buddy-reads";
import { useIsOnline } from "@/services/social/cache";
import { OfflineNotice, SocialGate, Spinner, StaleNotice } from "./social-gate";

function BuddyReadsContent() {
	const isOnline = useIsOnline();
	const reads = useBuddyReads();
	const [isPickerOpen, setIsPickerOpen] = useState(false);

	if (reads.isPending) return <Spinner />;
	if (reads.isError && !reads.data) {
		return (
			<OfflineNotice onRetry={() => void reads.refetch()}>
				{isOnline
					? "Couldn't load your buddy reads. Try again."
					: "You're offline. Your buddy reads will show once you're back online."}
			</OfflineNotice>
		);
	}
	const active = reads.data.filter((r) => r.status === "in_progress");
	const finished = reads.data.filter((r) => r.status === "finished");
	return (
		<>
			<StaleNotice
				isOnline={isOnline}
				isError={reads.isError}
				onRetry={() => void reads.refetch()}
			/>
			<SocialSection
				title="In progress"
				action={
					active.length > 0 ? (
						<button type="button" onClick={() => setIsPickerOpen(true)} className={SECTION_ACTION}>
							<Plus className="size-4" />
							Start one
						</button>
					) : undefined
				}
			>
				{active.length === 0 ? (
					<div className={cn(CARD_SURFACE, "px-4 py-6 text-center")}>
						<Users className="mx-auto mb-2 size-8 text-muted-foreground" />
						<p className="m-0 text-muted-foreground text-sm">
							{finished.length > 0
								? "Nothing in progress right now."
								: "No buddy reads yet. Read a book together with friends and see where everyone is."}
						</p>
						<Button size="sm" className="mt-3" onClick={() => setIsPickerOpen(true)}>
							Start a buddy read
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{active.map((read, i) => (
							<BuddyReadCard key={read.id} read={read} index={i} />
						))}
					</div>
				)}
			</SocialSection>
			{finished.length > 0 && (
				<SocialSection title="Finished">
					<div className="flex flex-col gap-3">
						{finished.map((read, i) => (
							<BuddyReadCard key={read.id} read={read} index={i} />
						))}
					</div>
				</SocialSection>
			)}
			<StartBuddyReadPicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
		</>
	);
}

export default function BuddyReadsPage() {
	return (
		<div className="bg-background">
			<PageHeader width="text" title="Buddy reads" icon={Users} backTo="/tabs/social" />
			<PageBody width="text">
				<SocialGate returnTo="/tabs/social/buddy-reads">
					<BuddyReadsContent />
				</SocialGate>
			</PageBody>
		</div>
	);
}
