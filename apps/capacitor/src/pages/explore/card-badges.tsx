import { cn } from "@lesefluss/ui/utils";
import { Check, Loader2, Plus } from "lucide-react";
import type React from "react";

export const InLibraryBadge: React.FC<{ className?: string }> = ({ className }) => (
	<span
		data-testid="in-library-badge"
		className={cn(
			"inline-flex items-center gap-0.5 rounded-sm bg-primary px-1.5 py-0.5 font-semibold text-[0.6rem] text-primary-foreground",
			className,
		)}
	>
		<Check className="size-3" aria-hidden />
		In library
	</span>
);

type QuickAddButtonProps = {
	title: string;
	isAdding: boolean;
	onAdd: () => void;
	className?: string;
};

/**
 * Rendered as a sibling of the card's main button, never inside it: nested
 * buttons are invalid HTML, and a tap here must not also open the detail page.
 */
export const QuickAddButton: React.FC<QuickAddButtonProps> = ({
	title,
	isAdding,
	onAdd,
	className,
}) => (
	<button
		type="button"
		aria-label={`Add ${title} to library`}
		disabled={isAdding}
		onClick={onAdd}
		className={cn(
			"flex size-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur active:opacity-70 disabled:opacity-70",
			className,
		)}
	>
		{isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
	</button>
);

/** QuickAddButton pinned to the bottom-right of a 2:3 cover that starts at the card's top. */
export const QuickAddOverlay: React.FC<Omit<QuickAddButtonProps, "className">> = (props) => (
	<div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
		<QuickAddButton {...props} className="pointer-events-auto absolute right-1.5 bottom-1.5" />
	</div>
);
