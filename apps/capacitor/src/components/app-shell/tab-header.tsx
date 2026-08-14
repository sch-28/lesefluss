import type { ComponentType, ReactNode } from "react";

interface TabHeaderProps {
	title?: string;
	icon?: ComponentType<{ className?: string }>;
	logo?: string;
	right?: ReactNode;
	children?: ReactNode;
}

/**
 * Sticky header for tab-root pages (Library, Explore, Settings). Includes
 * safe-area-inset-top padding so its background covers the status bar.
 * Detail pages use PageHeader instead, which renders a back chevron.
 */
export function TabHeader({ title, icon: Icon, logo, right, children }: TabHeaderProps) {
	const shellClass =
		"sticky top-0 z-20 flex flex-col border-border border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur";
	const innerClass = "flex h-12 items-center gap-2 px-3";

	if (children) {
		return (
			<header className={shellClass}>
				<div className={innerClass}>{children}</div>
			</header>
		);
	}
	return (
		<header className={shellClass}>
			<div className={innerClass}>
				{logo && <img src={logo} alt="" className="size-5 shrink-0" />}
				{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
				{/* `min-w-0` so the title gives way first: without it the flex item cannot
				    shrink below the width of its longest word, and Library's row of six
				    actions is pushed off the right edge on a narrow phone. */}
				<h1 className="m-0 min-w-0 flex-1 truncate font-semibold text-base leading-5">{title}</h1>
				{right}
			</div>
		</header>
	);
}
