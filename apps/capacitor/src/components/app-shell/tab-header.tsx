import type { ComponentType, ReactNode } from "react";
import { PageContainer, type PageWidth } from "../page-container";
import { HEADER_SHELL, HEADER_TITLE } from "./page-header";

interface TabHeaderProps {
	title?: string;
	/** The page's content width, so the header lines up with the content column. */
	width: PageWidth;
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
export function TabHeader({ title, width, icon: Icon, logo, right, children }: TabHeaderProps) {
	return (
		<header className={HEADER_SHELL}>
			<PageContainer width={width} className="flex h-12 items-center gap-2 px-4">
				{children ?? (
					<>
						{logo && <img src={logo} alt="" className="size-5 shrink-0" />}
						{Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
						{/* `min-w-0` so the title gives way first: without it the flex item cannot
						    shrink below the width of its longest word, and Library's row of six
						    actions is pushed off the right edge on a narrow phone. */}
						{/* data-clips-text: the truncation is meant (e2e layout check). */}
						<h1 data-clips-text className={HEADER_TITLE}>
							{title}
						</h1>
						{right}
					</>
				)}
			</PageContainer>
		</header>
	);
}
