import type { BuddyReadSummary } from "@lesefluss/core";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyRow, Section } from "@/components/app-shell/section";
import { useBuddyReads } from "@/services/social/buddy-reads";
import { useIsOnline } from "@/services/social/cache";
import { OfflineNotice, SocialGate, Spinner, StaleNotice } from "./social-gate";

function BuddyReadRow({ read }: { read: BuddyReadSummary }) {
	const people = `${read.memberCount} ${read.memberCount === 1 ? "person" : "people"}`;
	const host = read.host ? `hosted by ${read.host.name}` : null;
	return (
		<Link
			to="/tabs/social/buddy-read/$id"
			params={{ id: read.id }}
			className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-muted/60"
		>
			<BookOpen className="size-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-foreground text-sm">{read.title}</div>
				<div className="truncate text-muted-foreground text-xs">
					{[read.author, people, host].filter(Boolean).join(" · ")}
				</div>
			</div>
			<ChevronRight className="size-4 text-muted-foreground" />
		</Link>
	);
}

function BuddyReadsContent() {
	const isOnline = useIsOnline();
	const reads = useBuddyReads();

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
			<Section title="Reading together">
				{active.length === 0 && finished.length > 0 ? (
					<EmptyRow>Nothing in progress right now.</EmptyRow>
				) : active.length === 0 ? (
					<EmptyRow>
						No buddy reads yet. Open a book in your library and choose "Start buddy read" to read it
						with friends and see where everyone is.
					</EmptyRow>
				) : (
					active.map((read) => <BuddyReadRow key={read.id} read={read} />)
				)}
			</Section>
			{finished.length > 0 && (
				<Section title="Finished">
					{finished.map((read) => (
						<BuddyReadRow key={read.id} read={read} />
					))}
				</Section>
			)}
		</>
	);
}

export default function BuddyReadsPage() {
	return (
		<div className="bg-background">
			<PageHeader title="Buddy reads" icon={Users} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social/buddy-reads">
					<BuddyReadsContent />
				</SocialGate>
			</div>
		</div>
	);
}
