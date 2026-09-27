import { useLocation } from "@tanstack/react-router";
import { Compass, LibraryBig, Settings, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useSyncContext } from "../../contexts/sync-context";
import { useRefetchSocialOnForeground } from "../../services/social/cache";
import { useUnreadCount } from "../../services/social/inbox";
import { SYNC_ENABLED } from "../../services/sync";

export type NavTarget = {
	to: "/tabs/library" | "/tabs/explore" | "/tabs/social" | "/tabs/settings";
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/** A count pill, a plain dot, or nothing. */
export type NavBadge = number | "dot" | undefined;

export const NAV_ITEMS: readonly NavTarget[] = [
	{ to: "/tabs/library", label: "Library", icon: LibraryBig },
	{ to: "/tabs/explore", label: "Explore", icon: Compass },
	{ to: "/tabs/social", label: "Social", icon: Users },
	{ to: "/tabs/settings", label: "Settings", icon: Settings },
];

export function useActiveNavTo(): NavTarget["to"] | null {
	const { pathname } = useLocation();
	return (
		NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
	);
}

/** Badges per tab. Hidden while signed out, when sync is off, and when the count request fails. */
export function useNavBadges(): Partial<Record<NavTarget["to"], NavBadge>> {
	const { isLoggedIn } = useSyncContext();
	const unread = useUnreadCount(isLoggedIn && SYNC_ENABLED);
	useRefetchSocialOnForeground();
	const count = unread.data?.count ?? 0;
	return { "/tabs/social": count > 0 ? count : undefined };
}
