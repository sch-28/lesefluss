import { cn } from "@lesefluss/ui/utils";
import { Check, Loader2, Plus } from "lucide-react";
import type React from "react";
import type { LengthLabels } from "./length";

export const InLibraryBadge: React.FC<{ className?: string }> = ({ className }) => (
	<span
		data-testid="in-library-badge"
		className={cn(
			"inline-flex items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 font-semibold text-2xs text-primary-foreground",
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
	icon?: React.ComponentType<{ className?: string }>;
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
	icon: Icon = Plus,
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
		{isAdding ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
	</button>
);

/**
 * On the cover's bottom corner, so it lines up across a row whatever each title's length
 * and the title keeps its full width. The user chose this over keeping the cover clear
 * (LESE-214.3). The visible 32px button plus its hit slop is a 44px target.
 */
export const QuickAddOnCover: React.FC<Omit<QuickAddButtonProps, "className">> = (props) => (
	<div className="pointer-events-none absolute inset-x-0 top-0 aspect-2/3">
		<QuickAddButton {...props} className="pointer-events-auto absolute right-1.5 bottom-1.5" />
	</div>
);

/**
 * The one line under a card's title: the author (cut first) then the length, or the
 * In library badge in the author's place. Kept when empty so a row's cards and their
 * skeleton share one height.
 */
export const CardMeta: React.FC<{
	author?: string | null;
	labels?: LengthLabels | null;
	/** Stands in for the length when there is none, e.g. a serial's chapter count. */
	lengthFallback?: string | null;
	isInLibrary?: boolean;
}> = ({ author, labels, lengthFallback, isInLibrary }) => {
	const lead = isInLibrary ? <InLibraryBadge className="shrink-0" /> : author || null;
	// Beside the badge, or as a wide chapter count, the length must give way too or the line
	// runs into the next card on a phone grid.
	const lengthFits = labels && !isInLibrary ? "shrink-0" : "min-w-0 overflow-hidden text-ellipsis";
	const length = labels ? (
		<span data-testid="card-length" className={cn(lengthFits, "text-2xs tabular-nums")}>
			<LengthText labels={labels} variant="time" />
		</span>
	) : lengthFallback ? (
		<span className={cn(lengthFits, "text-2xs")}>{lengthFallback}</span>
	) : null;
	return (
		<div
			data-testid="card-meta"
			className="mt-0.5 flex h-[1lh] min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground text-xs"
		>
			{typeof lead === "string" ? (
				<span className="min-w-0 overflow-hidden text-ellipsis">{lead}</span>
			) : (
				lead
			)}
			{lead && length && (
				<span aria-hidden className="shrink-0">
					·
				</span>
			)}
			{length}
		</div>
	);
};

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
