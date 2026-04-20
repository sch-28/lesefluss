import type { LucideIcon } from "lucide-react";

export const GITHUB_REPO = "https://github.com/sch-28/lesefluss";

export type DocsSection = {
	id: string;
	title: string;
	icon: LucideIcon;
	Content: React.ComponentType;
};
