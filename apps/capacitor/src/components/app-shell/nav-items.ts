import { useMatchRoute } from "@tanstack/react-router";
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
	const matchRoute = useMatchRoute();
	return NAV_ITEMS.find((item) => matchRoute({ to: item.to, fuzzy: true }))?.to ?? null;
}
