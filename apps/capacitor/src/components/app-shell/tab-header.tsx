import type { ComponentType, ReactNode } from "react";

interface TabHeaderProps {
	title?: string;
	icon?: ComponentType<{ className?: string }>;
	logo?: string;
	right?: ReactNode;
	children?: ReactNode;
}

/**
 * Sticky header for tab-root pages (Library, Explore, Settings).
 * Detail pages use PageHeader instead, which renders a back chevron.
 */
export function TabHeader({ title, icon: Icon, logo, right, children }: TabHeaderProps) {
	if (children) {
		return (
			<header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-border border-b bg-background/95 px-3 backdrop-blur">
				{children}
			</header>
		);
	}
	return (
		<header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-border border-b bg-background/95 px-3 backdrop-blur">
			{logo && <img src={logo} alt="" className="size-5" />}
			{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
			<h1 className="m-0 flex-1 font-semibold text-base leading-none">{title}</h1>
			{right}
		</header>
	);
}
