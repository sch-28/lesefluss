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
 * QuickAddButton in the card's bottom corner, beside the length line: on the cover
 * it hid titles printed into the art, beside the title it cut the title short,
 * beside the author it cut a phone grid's authors to a few letters. `CardMeta`
 * is the button's height and keeps `QUICK_ADD_CLEARANCE` free for it, so the
 * card must always render it.
 */
export const QuickAddBesideMeta: React.FC<Omit<QuickAddButtonProps, "className">> = (props) => (
	<QuickAddButton {...props} className="absolute right-0 bottom-0" />
);

export const QUICK_ADD_CLEARANCE = "pr-9";

/**
 * Under a card's title, off the cover, where corner badges hid titles printed into the art.
 * As tall as the quick-add button, empty or not, so every card in a row, and the skeleton, keeps one height.
 */
export const CardMeta: React.FC<{ labels?: LengthLabels | null; isInLibrary?: boolean }> = ({
	labels,
	isInLibrary,
}) => (
	<div className="mt-1 flex min-h-8 flex-wrap items-center gap-1 text-[0.7rem]">
		{isInLibrary && <InLibraryBadge />}
		{labels && (
			<span data-testid="card-length" className="text-muted-foreground tabular-nums">
				<LengthText labels={labels} variant="time" />
			</span>
		)}
	</div>
);

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
