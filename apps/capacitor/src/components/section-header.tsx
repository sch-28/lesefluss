import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** The section title type. A heading that is not a SectionHeader takes this class, so every section title reads the same. */
export const SECTION_TITLE = "m-0 font-semibold text-base text-foreground";

/** The one section header: a title, an optional muted line under it, and an aside or action at its end. */
export function SectionHeader({
	title,
	subtitle,
	aside,
	className,
}: {
	title?: React.ReactNode;
	subtitle?: React.ReactNode;
	/** A muted count or a control, at the end of the row. */
	aside?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("mb-2 flex items-end justify-between gap-3", className)}>
			<div className="flex min-w-0 flex-col gap-1">
				{title && <h2 className={SECTION_TITLE}>{title}</h2>}
				{subtitle != null && <p className="m-0 text-muted-foreground text-sm">{subtitle}</p>}
			</div>
			{aside != null && (
				<div className="flex shrink-0 items-center text-muted-foreground text-sm tabular-nums">
					{aside}
				</div>
			)}
		</header>
	);
}

/** 24px above every section but the first. Padding, not margin, so an untitled section keeps the rhythm too. */
export const SECTION_SPACING = "pt-6 first:pt-0";

/**
 * The one section: its spacing and its header. Settings, social and stats sections wrap it;
 * `headerClassName` only insets the header to a card's gutter.
 */
export function Section({
	title,
	subtitle,
	aside,
	headerClassName,
	className,
	children,
	"data-testid": testId,
}: {
	title?: string;
	subtitle?: React.ReactNode;
	aside?: React.ReactNode;
	headerClassName?: string;
	className?: string;
	children: React.ReactNode;
	"data-testid"?: string;
}) {
	return (
		<section className={cn(SECTION_SPACING, className)} data-testid={testId}>
			{(title || aside != null) && (
				<SectionHeader
					title={title}
					subtitle={subtitle}
					aside={aside}
					className={headerClassName}
				/>
			)}
			{children}
		</section>
	);
}
