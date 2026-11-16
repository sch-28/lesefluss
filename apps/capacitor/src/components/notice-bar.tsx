import { X } from "lucide-react";
import type { ReactNode } from "react";
import { PageContainer } from "./page-container";

/** A dismissible strip above the library: full-bleed tint, its text on the grid's column. */
export function NoticeBar({
	icon,
	children,
	onDismiss,
}: {
	icon?: ReactNode;
	children: ReactNode;
	onDismiss: () => void;
}) {
	return (
		<div className="border-border border-b bg-muted/60 text-sm">
			<PageContainer width="grid" className="flex items-start gap-3 px-4 py-3">
				{icon}
				<span className="flex-1 text-muted-foreground">{children}</span>
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss"
					className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="size-4" />
				</button>
			</PageContainer>
		</div>
	);
}
