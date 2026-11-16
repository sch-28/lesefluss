import { useLocation } from "@tanstack/react-router";
import { BarChart3, Compass, LibraryBig, Settings, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useSyncContext } from "../../contexts/sync-context";
import { useRefetchSocialOnForeground } from "../../services/social/cache";
import { useUnreadCount } from "../../services/social/inbox";
import { SYNC_ENABLED } from "../../services/sync";

export type NavTarget = {
	to: "/tabs/library" | "/tabs/stats" | "/tabs/explore" | "/tabs/social" | "/tabs/settings";
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/** A count pill, a plain dot, or nothing. */
export type NavBadge = number | "dot" | undefined;

export const NAV_ITEMS: readonly NavTarget[] = [
	{ to: "/tabs/library", label: "Library", icon: LibraryBig },
	{ to: "/tabs/stats", label: "Stats", icon: BarChart3 },
	{ to: "/tabs/explore", label: "Explore", icon: Compass },
	{ to: "/tabs/social", label: "Social", icon: Users },
	{ to: "/tabs/settings", label: "Settings", icon: Settings },
];

/** Without a sync server there is no account, so Social has nothing to show. Signed out it shows the sign-in pitch. */
export function useNavItems(): readonly NavTarget[] {
	if (SYNC_ENABLED) return NAV_ITEMS;
	return NAV_ITEMS.filter((item) => item.to !== "/tabs/social");
}

export function useActiveNavTo(): NavTarget["to"] | null {
	const { pathname } = useLocation();
	return activeNavTo(pathname);
}

function activeNavTo(pathname: string): NavTarget["to"] | null {
	return (
		NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
	);
}

/** A page the desktop sidebar lists as its own row (a collection, shelf or series); that row
 *  carries the highlight, not Library as well. */
export function isSidebarListPage(pathname: string, search: Record<string, unknown>): boolean {
	if (pathname === "/tabs/library") return !!(search.collection || search.shelf);
	return pathname === "/tabs/library/all-series" || pathname.startsWith("/tabs/library/series/");
}

/** Badges per tab. Hidden while signed out, when sync is off, and when the count request fails. */
export function useNavBadges(): Partial<Record<NavTarget["to"], NavBadge>> {
	const { isLoggedIn } = useSyncContext();
	const unread = useUnreadCount(isLoggedIn && SYNC_ENABLED);
	useRefetchSocialOnForeground();
	const count = unread.data?.count ?? 0;
	return { "/tabs/social": count > 0 ? count : undefined };
}
