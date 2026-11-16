import { Link } from "@tanstack/react-router";
import { UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyRow, Section } from "@/components/app-shell/section";
import { PageContainer } from "@/components/page-container";
import { useRelationships } from "@/services/social/friends";
import { formatPercent } from "@/utils/format-percent";
import { PersonRow } from "./person-row";
import { OfflineNotice, SocialGate, Spinner } from "./social-gate";

function FriendsContent() {
	const relationships = useRelationships();

	if (relationships.isPending) return <Spinner />;
	if (relationships.isError && !relationships.data) {
		return (
			<OfflineNotice onRetry={() => void relationships.refetch()}>
				Couldn't load your friends.
			</OfflineNotice>
		);
	}
	const friends = relationships.data.friends;
	return (
		<Section title={`${friends.length} ${friends.length === 1 ? "friend" : "friends"}`}>
			{friends.length === 0 ? (
				<EmptyRow>No friends yet. Invite someone to read with.</EmptyRow>
			) : (
				friends.map((friend) => (
					<PersonRow
						key={friend.userId}
						person={friend}
						linkToProfile
						subtitle={
							friend.nowReading
								? `${friend.nowReading.title}, ${formatPercent(friend.nowReading.progressPercent)}`
								: undefined
						}
					/>
				))
			)}
		</Section>
	);
}

export default function FriendsPage() {
	return (
		<div className="bg-background">
			<PageHeader
				width="text"
				title="Friends"
				icon={Users}
				backTo="/tabs/social"
				right={
					<Link to="/tabs/social/invite-link" className="no-underline">
						<span className="flex min-h-11 items-center gap-1 text-primary text-sm">
							<UserPlus className="size-4" />
							Invite
						</span>
					</Link>
				}
			/>
			<PageContainer width="text" className="px-4 pb-10">
				<SocialGate returnTo="/tabs/social/friends">
					<FriendsContent />
				</SocialGate>
			</PageContainer>
		</div>
	);
}
