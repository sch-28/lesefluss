import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import { ChevronRight, Gauge } from "lucide-react";
import { Fragment, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import { type ChipPart, type ChipSpeeds, chipParts, modelSpeeds } from "./speed-chip-model";
import { type SpeedChipBook, SpeedDetails } from "./speed-details";

const CHIP_CLASS =
	"relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs tabular-nums";

function ChipText({ parts }: { parts: ChipPart[] }) {
	return parts.map((part, i) => (
		<Fragment key={part.mode}>
			{i > 0 && <span className="text-muted-foreground">·</span>}
			<span>
				<span className="text-muted-foreground">{part.mode === "rsvp" ? "RSVP" : "Reading"} </span>
				<b className="font-semibold">{part.wpm}</b>
				{i === 0 && <span className="text-muted-foreground"> wpm</span>}
			</span>
		</Fragment>
	));
}

/** Someone else's speeds: shown, never opened. */
export function SpeedChipStatic({ speeds, className }: { speeds: ChipSpeeds; className?: string }) {
	const parts = chipParts(speeds);
	if (parts.length === 0) return null;
	return (
		<span className={cn(CHIP_CLASS, className)} data-testid="speed-chip">
			<Gauge className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
			<ChipText parts={parts} />
		</span>
	);
}

/**
 * The reader's own speed chip. It opens the details in a popover anchored to
 * it, on phones too: a sheet blurred the page the numbers are about. `onOpen`
 * replaces the popover where the full Speed tab is one tap away.
 */
export function SpeedChip({
	book,
	bare = false,
	className,
	onOpen,
}: {
	book?: SpeedChipBook;
	bare?: boolean;
	className?: string;
	onOpen?: () => void;
}) {
	const { data: model } = queryHooks.useStatsSpeedModel();
	const { data: settings } = queryHooks.useSettings();
	const [isOpen, setIsOpen] = useState(false);
	if (!model || !settings) return null;

	const primary = settings.defaultReaderMode === "rsvp" ? "rsvp" : "reading";
	const parts = chipParts(modelSpeeds(model), primary);
	const details = (
		<SpeedDetails
			model={model}
			dialWpm={settings.wpm}
			showDial={model.modesUsed.rsvp || settings.defaultReaderMode === "rsvp"}
			primary={primary}
			book={book}
			onNavigate={() => setIsOpen(false)}
		/>
	);
	const trigger = (
		<button
			type="button"
			data-testid="speed-chip"
			aria-haspopup={onOpen ? undefined : "dialog"}
			aria-expanded={onOpen ? undefined : isOpen}
			onClick={onOpen}
			// The before: box widens the hit area to a finger.
			className={cn(
				"before:absolute before:inset-x-0 before:content-['']",
				bare
					? "relative inline-flex items-center gap-1 tabular-nums before:-inset-y-2.5"
					: cn(CHIP_CLASS, "before:-inset-y-1.5 hover:bg-muted"),
				className,
			)}
		>
			<Gauge className="size-3.5 text-muted-foreground" aria-hidden="true" />
			<ChipText parts={parts} />
			<ChevronRight className="-mr-1 size-3.5 text-muted-foreground" aria-hidden="true" />
		</button>
	);

	if (onOpen) return trigger;
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				align="end"
				collisionPadding={16}
				className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
			>
				{details}
			</PopoverContent>
		</Popover>
	);
}
