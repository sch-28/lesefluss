import { cn } from "@lesefluss/ui/utils";
import { Check, Loader2, Plus } from "lucide-react";
import type React from "react";
import type { LengthLabels } from "./length";

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
			"relative flex size-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur before:absolute before:-inset-1.5 before:content-[''] active:opacity-70 disabled:opacity-70",
			className,
		)}
	>
		{isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
	</button>
);

/**
 * QuickAddButton just below a 2:3 cover that starts at the card's top, beside
 * the title: on the cover it hid titles printed into the art. The card's title
 * block keeps `QUICK_ADD_CLEARANCE` free for it.
 */
export const QuickAddBesideTitle: React.FC<Omit<QuickAddButtonProps, "className">> = (props) => (
	<div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
		<QuickAddButton {...props} className="pointer-events-auto absolute top-full right-0 mt-1" />
	</div>
);

export const QUICK_ADD_CLEARANCE = "pr-9";

/** Under a card's title, off the cover, where corner badges hid titles printed into the art. */
export const CardMeta: React.FC<{ labels?: LengthLabels | null; isInLibrary?: boolean }> = ({
	labels,
	isInLibrary,
}) =>
	labels || isInLibrary ? (
		<div className="mt-1 flex flex-wrap items-center gap-1">
			{isInLibrary && <InLibraryBadge />}
			{labels && (
				<span
					data-testid="card-length"
					className="text-[0.7rem] text-muted-foreground tabular-nums"
				>
					<LengthText labels={labels} variant="time" />
				</span>
			)}
		</div>
	) : null;

/** Length as text, read out as a sentence rather than "tilde … middle dot". */
export const LengthText: React.FC<{ labels: LengthLabels; variant?: "text" | "time" }> = ({
	labels,
	variant = "text",
}) => (
	<>
		<span aria-hidden>{variant === "text" ? labels.text : labels.time}</span>
		<span className="sr-only">{variant === "text" ? labels.spoken : labels.spokenTime}</span>
	</>
);
