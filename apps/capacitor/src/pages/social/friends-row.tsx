import type { SocialRelationships } from "@lesefluss/core";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { Link2, Plus } from "lucide-react";
import { progressRing, SocialSection } from "@/components/social/social-ui";

/** Friends as faces, each ringed by how far they are in the book they read now. */
export function FriendsRow({ friends }: { friends: SocialRelationships["friends"] }) {
	return (
		<SocialSection
			title="Friends"
			action={
				<Link to="/tabs/social/invite-link" className="no-underline">
					<span className="flex items-center gap-1 text-primary text-xs">
						<Link2 className="size-3.5" />
						Add friend
					</span>
				</Link>
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
									? `${f.name}, reading ${f.nowReading.title}, ${f.nowReading.progressPercent}%`
									: f.name
							}
							className="block text-center text-foreground no-underline"
						>
							<div
								className="mx-auto size-[66px] rounded-full p-[3px]"
								style={{
									background: f.nowReading ? progressRing(f.nowReading.progressPercent) : undefined,
								}}
							>
								<div className="size-full rounded-full bg-background p-0.5">
									<SocialAvatar
										name={f.name}
										avatarUrl={f.avatarUrl}
										size="md"
										className="size-full text-lg"
									/>
								</div>
							</div>
							<div className="mt-1.5 truncate font-semibold text-[12.5px]">{f.name}</div>
							<div className="mt-px truncate text-[10.5px] text-muted-foreground">
								{f.nowReading?.title ?? `@${f.handle}`}
							</div>
						</Link>
					</li>
				))}
				<li className="w-[72px] shrink-0">
					<Link
						to="/tabs/social/invite-link"
						className="block text-center text-primary no-underline"
					>
						<div className="mx-auto flex size-[66px] items-center justify-center rounded-full border-[1.5px] border-primary border-dashed">
							<Plus className="size-[22px]" />
						</div>
						<div className="mt-1.5 font-semibold text-[12.5px]">Invite</div>
					</Link>
				</li>
			</ul>
		</SocialSection>
	);
}
