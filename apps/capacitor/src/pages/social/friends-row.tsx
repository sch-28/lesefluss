import type { SocialRelationships } from "@lesefluss/core";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { ProgressBar, SocialSection } from "@/components/social/social-ui";
import { formatPercent } from "@/utils/format-percent";

/** Friends as faces, each with how far they are in the book they read now; See all lists them. */
export function FriendsRow({ friends }: { friends: SocialRelationships["friends"] }) {
	return (
		<SocialSection
			title="Friends"
			action={
				<div className="flex items-center gap-4">
					<Link to="/tabs/social/invite-link" className="no-underline">
						<span className="flex min-h-11 items-center gap-1 text-primary text-sm">
							<UserPlus className="size-4" />
							Invite a friend
						</span>
					</Link>
					{/* The row scrolls only by swipe, so the list page is how a mouse reaches every friend. */}
					<Link to="/tabs/social/friends" className="no-underline">
						<span className="flex min-h-11 items-center text-primary text-sm">See all</span>
					</Link>
				</div>
			}
		>
			<ul className="m-0 -mx-4 flex list-none gap-3.5 overflow-x-auto px-4 pt-1 pb-2">
				{friends.map((f) => (
					<li key={f.userId} className="w-[72px] shrink-0">
						<Link
							to="/tabs/social/profile/$userId"
							params={{ userId: f.userId }}
							aria-label={
								f.nowReading
									? `${f.name}, reading ${f.nowReading.title}, ${formatPercent(f.nowReading.progressPercent)}`
									: f.name
							}
							className="block text-center text-foreground no-underline"
						>
							<SocialAvatar
								name={f.name}
								avatarUrl={f.avatarUrl}
								size="md"
								className="mx-auto size-[66px] text-lg"
							/>
							<div className="mt-1.5 truncate font-semibold text-[12.5px]">{f.name}</div>
							<div className="mt-px truncate text-[10.5px] text-muted-foreground">
								{f.nowReading?.title ?? `@${f.handle}`}
							</div>
							{f.nowReading && (
								<ProgressBar
									percent={f.nowReading.progressPercent}
									className="mx-auto mt-1 h-1 w-12"
								/>
							)}
						</Link>
					</li>
				))}
			</ul>
		</SocialSection>
	);
}
