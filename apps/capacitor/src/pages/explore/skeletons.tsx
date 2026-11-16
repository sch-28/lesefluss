import { cn } from "@lesefluss/ui/utils";
import type React from "react";

export const EXPLORE_GRID_CLASS =
	"grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const SKELETON_BLOCK = "animate-pulse rounded bg-muted";

/**
 * Same box as `ResultCard`, so content lands without shifting the layout.
 * `extraLines`: small text lines a card has beyond it, like a web novel's chapters.
 */
export const CardSkeleton: React.FC<{ extraLines?: number }> = ({ extraLines = 0 }) => (
	<div className="flex w-full flex-col" data-testid="card-skeleton">
		<div className="aspect-2/3 w-full animate-pulse rounded-sm border border-border bg-muted" />
		{/* The line boxes of ResultCard's title (two lines), author and length, so a
		    loaded shelf or grid row keeps the skeleton's height. */}
		<div className="px-0.5 pt-1">
			<div className="h-[2lh] text-[0.85rem] leading-[1.2]">
				<div className={cn(SKELETON_BLOCK, "h-[0.9lh] w-11/12")} />
			</div>
			<div className="mt-0.5 flex h-[1lh] items-center text-[0.75rem]">
				<div className={cn(SKELETON_BLOCK, "h-3 w-2/3")} />
			</div>
			{skeletonKeys(extraLines).map((key) => (
				<div key={key} className="mt-0.5 h-[1lh] text-[0.7rem]" />
			))}
			<div className="mt-1 h-8" />
		</div>
	</div>
);

/**
 * Fits a catalog list row's title (two lines), author, length and one line of chips, so a
 * loaded row is as tall as its skeleton whatever it holds.
 */
export const LIST_ROW_TEXT_HEIGHT = "min-h-[6.5rem]";

export const ListItemSkeleton: React.FC<{ textClassName?: string }> = ({ textClassName }) => (
	<div className="flex items-center gap-3 py-3" data-testid="card-skeleton">
		<div className="h-16 w-11 shrink-0 animate-pulse rounded border border-border bg-muted" />
		<div className={cn("flex-1", textClassName)}>
			<div className={cn(SKELETON_BLOCK, "h-3.5 w-3/4")} />
			<div className={cn(SKELETON_BLOCK, "mt-1.5 h-3 w-1/3")} />
		</div>
	</div>
);

// Fixed keys: the skeleton list never reorders.
const skeletonKeys = (count: number) => Array.from({ length: count }, (_, i) => `skeleton-${i}`);

export const CardGridSkeleton: React.FC<{
	count?: number;
	layout?: "grid" | "list";
	extraLines?: number;
	listTextClassName?: string;
	className?: string;
}> = ({ count = 12, layout = "grid", extraLines, listTextClassName, className }) => (
	<div
		role="status"
		aria-busy="true"
		aria-label="Loading"
		className={cn(layout === "grid" ? EXPLORE_GRID_CLASS : "flex flex-col gap-2", className)}
	>
		{skeletonKeys(count).map((key) =>
			layout === "grid" ? (
				<CardSkeleton key={key} extraLines={extraLines} />
			) : (
				<ListItemSkeleton key={key} textClassName={listTextClassName} />
			),
		)}
	</div>
);

/** `isSpacer`: an invisible copy that only holds the strip's height. */
export const ShelfStripSkeleton: React.FC<{
	count?: number;
	isSpacer?: boolean;
	extraLines?: number;
}> = ({ count = 6, isSpacer = false, extraLines }) => (
	<div
		className={cn("flex gap-3 overflow-hidden pb-2", isSpacer && "invisible")}
		{...(isSpacer
			? { "aria-hidden": true }
			: { role: "status", "aria-busy": true, "aria-label": "Loading" })}
	>
		{skeletonKeys(count).map((key) => (
			<div key={key} className="shrink-0" style={{ width: "7.5rem" }}>
				<CardSkeleton extraLines={extraLines} />
			</div>
		))}
	</div>
);

/** Mirrors `Shelf`: title row, then a horizontal strip of fixed-width cards. */
export const ShelfSkeleton: React.FC = () => (
	<section className="mb-6">
		<div className="mb-2 flex min-h-7 items-center">
			<div className={cn(SKELETON_BLOCK, "h-4 w-32")} />
		</div>
		<ShelfStripSkeleton />
	</section>
);

export const HeroSkeleton: React.FC = () => (
	<section
		role="status"
		aria-busy="true"
		aria-label="Loading"
		className="mb-6 flex gap-4 rounded-xl border border-border bg-card p-4"
	>
		<div className="aspect-2/3 w-28 shrink-0 animate-pulse rounded-md border border-border bg-muted" />
		<div className="flex flex-1 flex-col">
			<div className={cn(SKELETON_BLOCK, "h-3 w-16")} />
			<div className={cn(SKELETON_BLOCK, "mt-2 h-4 w-3/4")} />
			<div className={cn(SKELETON_BLOCK, "mt-2 h-3.5 w-1/2")} />
		</div>
	</section>
);
