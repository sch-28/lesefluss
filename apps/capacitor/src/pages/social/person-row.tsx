import type { SocialIdentity } from "@lesefluss/core";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import type React from "react";

/** One person as the API returns them: avatar, name, @handle. Never the account's own fields. */
export function PersonRow({
	person,
	subtitle,
	trailing,
	linkToProfile = false,
}: {
	person: SocialIdentity;
	subtitle?: string;
	trailing?: React.ReactNode;
	/** Friends have a profile to open; request counterparts do not. */
	linkToProfile?: boolean;
}) {
	const body = (
		<>
			<SocialAvatar name={person.name} avatarUrl={person.avatarUrl} size="md" />
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-foreground text-sm">{person.name}</div>
				<div className="truncate text-muted-foreground text-xs">
					@{person.handle}
					{subtitle ? ` · ${subtitle}` : ""}
				</div>
			</div>
		</>
	);
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			{linkToProfile ? (
				<Link
					to="/tabs/social/profile/$userId"
					params={{ userId: person.userId }}
					className="flex min-w-0 flex-1 items-center gap-3 text-foreground no-underline"
				>
					{body}
				</Link>
			) : (
				<div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
			)}
			{trailing}
		</div>
	);
}
