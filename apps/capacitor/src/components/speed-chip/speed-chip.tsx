import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	drawerSnapPoints,
} from "@lesefluss/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import { ChevronRight, Gauge } from "lucide-react";
import { Fragment, useState } from "react";
import { useMediaQuery } from "../../hooks/use-media-query";
import { queryHooks } from "../../services/db/hooks";
import { type ChipPart, type ChipSpeeds, chipParts, modelSpeeds } from "./speed-chip-model";
import { type SpeedChipBook, SpeedDetails } from "./speed-details";

const SNAP_POINTS = drawerSnapPoints([0.7, 1]);

const CHIP_CLASS =
	"relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs tabular-nums";

function ChipText({ parts }: { parts: ChipPart[] }) {
	return parts.map((part, i) => (
		<Fragment key={part.mode}>
			{i > 0 && <span className="text-muted-foreground">·</span>}
			<span>
				{part.mode === "rsvp" && <span className="text-muted-foreground">RSVP </span>}
				{part.mode === "reading" && i > 0 && (
					<span className="text-muted-foreground">Reading </span>
				)}
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

/** The reader's own speed chip; opens the details as a sheet on phones and a popover on desktop. */
export function SpeedChip({
	book,
	bare = false,
	className,
}: {
	book?: SpeedChipBook;
	bare?: boolean;
	className?: string;
}) {
	const { data: model } = queryHooks.useStatsSpeedModel();
	const { data: settings } = queryHooks.useSettings();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
	if (!model || !settings) return null;

	const parts = chipParts(
		modelSpeeds(model),
		settings.defaultReaderMode === "rsvp" ? "rsvp" : "reading",
	);
	const details = (
		<SpeedDetails
			model={model}
			dialWpm={settings.wpm}
			showDial={model.modesUsed.rsvp || settings.defaultReaderMode === "rsvp"}
			book={book}
			onNavigate={() => setIsOpen(false)}
		/>
	);
	const trigger = (
		<button
			type="button"
			data-testid="speed-chip"
			aria-haspopup="dialog"
			aria-expanded={isOpen}
			onClick={() => {
				setSnap(SNAP_POINTS[0]);
				setIsOpen((open) => !open);
			}}
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

	if (isDesktop) {
		return (
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				<PopoverContent align="end" className="w-80">
					{details}
				</PopoverContent>
			</Popover>
		);
	}
	return (
		<>
			{trigger}
			<Drawer
				open={isOpen}
				onOpenChange={setIsOpen}
				snapPoints={SNAP_POINTS}
				activeSnapPoint={snap}
				setActiveSnapPoint={setSnap}
			>
				<DrawerContent>
					<DrawerHeader className="sr-only">
						<DrawerTitle>Your speed</DrawerTitle>
						<DrawerDescription>Reading and RSVP speed, and what estimates use.</DrawerDescription>
					</DrawerHeader>
					<div className="overflow-y-auto px-4 pb-6">{details}</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
