import { useLocation } from "@tanstack/react-router";
import { Compass, LibraryBig, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavTarget = {
	to: "/tabs/library" | "/tabs/explore" | "/tabs/settings";
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const NAV_ITEMS: readonly NavTarget[] = [
	{ to: "/tabs/library", label: "Library", icon: LibraryBig },
	{ to: "/tabs/explore", label: "Explore", icon: Compass },
	{ to: "/tabs/settings", label: "Settings", icon: Settings },
];

export function useActiveNavTo(): NavTarget["to"] | null {
	const { pathname } = useLocation();
	return (
		NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
	);
}
