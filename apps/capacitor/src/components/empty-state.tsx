import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** A page-level empty state takes the free height under the header, so it sits centred on a tall
 *  desktop window; on a phone it keeps its natural height and fits without scrolling. */
export const EMPTY_STATE_PAGE = "md:min-h-[calc(100dvh-16rem)]";

/** The one empty (or gone) view: an icon, a title, a line of help and the way to fill it. */
export const EmptyState: React.FC<
	{
		icon?: React.ComponentType<{ className?: string }>;
		title?: string;
		children?: React.ReactNode;
		/** The ways to fill the empty view, under the text. */
		action?: React.ReactNode;
		/** The page's only content: centre it in the free height (see EMPTY_STATE_PAGE). */
		page?: boolean;
		className?: string;
	} & Pick<React.HTMLAttributes<HTMLDivElement>, "role"> & {
			"data-testid"?: string;
			"data-error-kind"?: string;
		}
> = ({ icon: Icon, title, children, action, page, className, ...rest }) => (
	<div
		className={cn(
			"flex flex-col items-center justify-center gap-3 px-8 pb-8 text-center",
			// Inline it keeps its distance from the block above; as a page's first block PageBody
			// drops the margin, so it starts at the frame's content gap.
			page ? ["pt-8", EMPTY_STATE_PAGE] : "mt-8",
			className,
		)}
		data-empty-state={page ? "page" : "inline"}
		{...rest}
	>
		{Icon && <Icon className="size-8 text-muted-foreground" />}
		{(title || children) && (
			<div className="flex max-w-sm flex-col gap-1">
				{title && <h2 className="m-0 font-semibold text-base text-foreground">{title}</h2>}
				{children && <p className="m-0 text-muted-foreground text-sm">{children}</p>}
			</div>
		)}
		{action && <div className="mt-2 flex flex-col items-center gap-2">{action}</div>}
	</div>
);
