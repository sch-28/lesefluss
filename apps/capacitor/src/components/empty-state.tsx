import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** The one empty (or gone) view: an icon, a title, a line of help and the way to fill it. */
export const EmptyState: React.FC<{
	icon?: React.ComponentType<{ className?: string }>;
	title?: string;
	children?: React.ReactNode;
	/** The ways to fill the empty view, under the text. */
	action?: React.ReactNode;
	className?: string;
	"data-testid"?: string;
}> = ({ icon: Icon, title, children, action, className, "data-testid": testId }) => (
	<div
		className={cn("flex flex-col items-center justify-center gap-3 p-8 text-center", className)}
		data-testid={testId}
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
