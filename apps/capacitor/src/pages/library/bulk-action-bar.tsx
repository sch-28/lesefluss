import { Button } from "@lesefluss/ui/button";
import { Separator } from "@lesefluss/ui/separator";
import { cn } from "@lesefluss/ui/utils";
import {
	BookOpen,
	FolderPlus,
	Layers,
	type LucideIcon,
	MoreHorizontal,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { tabBarHidden } from "../../components/app-shell/tab-bar-visibility";
import type { BulkSheet, UseLibrarySelection } from "./use-library-selection";

type Props = {
	selection: UseLibrarySelection;
};

type MainAction = { label: string; icon: LucideIcon; sheet: Exclude<BulkSheet, null> };

/** The actions people reach for most get a labelled button; the rest sit behind More. */
const MAIN_ACTIONS: MainAction[] = [
	{ label: "Status", icon: BookOpen, sheet: "status" },
	{ label: "Collection", icon: FolderPlus, sheet: "collection" },
	{ label: "Series", icon: Layers, sheet: "series" },
];

/**
 * On a phone it takes the tab bar's place, the count above the actions; on
 * desktop it floats over the grid in one row. Search, filters and sort stay
 * usable above it: a selection is meant to be built across several filters,
 * which is the point of it surviving one.
 */
const BulkActionBar: React.FC<Props> = ({ selection }) => {
	useEffect(() => {
		tabBarHidden.set(true);
		return () => tabBarHidden.set(false);
	}, []);
	const isIdle = selection.picked.length === 0 || selection.isRunning;

	return (
		<div
			role="toolbar"
			aria-label="Selection"
			data-toast-clear
			className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)] md:inset-x-auto md:bottom-6 md:left-[calc(50%+var(--side-nav-w)/2)] md:max-w-[calc(100vw-var(--side-nav-w)-2rem)] md:-translate-x-1/2 md:rounded-xl md:border md:pb-0 md:shadow-lg"
		>
			<div className="flex flex-col md:flex-row md:items-center md:gap-2 md:px-2">
				<div className="flex min-h-11 min-w-0 flex-wrap items-center gap-1 px-2 md:h-12 md:flex-nowrap md:px-0">
					<Button variant="ghost" size="sm" disabled={selection.isRunning} onClick={selection.exit}>
						<X />
						Done
					</Button>
					<span className="flex-1 whitespace-nowrap px-1 font-semibold text-sm md:min-w-28">
						{selection.isRunning
							? `${selection.progress.done} of ${selection.progress.total}…`
							: `${selection.picked.length} selected`}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="shrink-0"
						disabled={selection.isRunning || selection.visibleCount === 0}
						onClick={selection.toggleAllVisible}
					>
						{selection.allVisibleSelected ? "Deselect all" : `Select all ${selection.visibleCount}`}
					</Button>
				</div>
				<div className="flex flex-wrap items-stretch border-border border-t md:flex-nowrap md:items-center md:gap-1 md:border-t-0 md:border-l md:pl-2">
					{MAIN_ACTIONS.map(({ label, icon: Icon, sheet }) => (
						<BarAction
							key={sheet}
							label={label}
							icon={Icon}
							disabled={isIdle}
							onClick={() => selection.openSheet(sheet)}
						/>
					))}
					<BarAction
						label="More"
						ariaLabel="More bulk actions"
						icon={MoreHorizontal}
						disabled={isIdle}
						onClick={() => selection.openSheet("actions")}
					/>
					<Separator
						orientation="vertical"
						className="my-2 md:mx-1 md:my-0 md:h-6 md:self-center"
					/>
					<BarAction
						label="Delete"
						icon={Trash2}
						destructive
						disabled={isIdle}
						onClick={() => selection.setDeleteOpen(true)}
					/>
				</div>
			</div>
		</div>
	);
};

/** Icon over label on the phone, the way the tab bar it replaces reads; one line on desktop. */
const BarAction: React.FC<{
	label: string;
	ariaLabel?: string;
	icon: LucideIcon;
	destructive?: boolean;
	disabled: boolean;
	onClick: () => void;
}> = ({ label, ariaLabel, icon: Icon, destructive, disabled, onClick }) => (
	<button
		type="button"
		aria-label={ariaLabel}
		disabled={disabled}
		onClick={onClick}
		className={cn(
			"flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:min-h-9 md:flex-none md:flex-row md:gap-2 md:px-3 md:text-sm",
			destructive ? "text-destructive" : "text-foreground",
		)}
	>
		<Icon className="size-5 shrink-0 md:size-4" />
		<span className="whitespace-nowrap">{label}</span>
	</button>
);

export default BulkActionBar;
