import { cn } from "@lesefluss/ui/utils";
import type React from "react";

export const EXPLORE_GRID_CLASS =
	"grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const SKELETON_BLOCK = "animate-pulse rounded bg-muted";

/** Same box as `ResultCard`, so content lands without shifting the layout. */
export const CardSkeleton: React.FC = () => (
	<div className="flex w-full flex-col" data-testid="card-skeleton">
		<div className="aspect-2/3 w-full animate-pulse rounded-sm border border-border bg-muted" />
		<div className="px-0.5 pt-1">
			<div className={cn(SKELETON_BLOCK, "h-3.5 w-11/12")} />
			<div className={cn(SKELETON_BLOCK, "mt-1.5 h-3 w-2/3")} />
		</div>
	</div>
);

const ListItemSkeleton: React.FC = () => (
	<div className="flex items-center gap-3 py-3" data-testid="card-skeleton">
		<div className="h-16 w-12 shrink-0 animate-pulse rounded border border-border bg-muted" />
		<div className="flex-1">
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
	className?: string;
}> = ({ count = 12, layout = "grid", className }) => (
	<div
		role="status"
		aria-busy="true"
		aria-label="Loading"
		className={cn(layout === "grid" ? EXPLORE_GRID_CLASS : "flex flex-col gap-2", className)}
	>
		{skeletonKeys(count).map((key) =>
			layout === "grid" ? <CardSkeleton key={key} /> : <ListItemSkeleton key={key} />,
		)}
	</div>
);

export const ShelfStripSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
	<div
		className="flex gap-3 overflow-hidden pb-2"
		role="status"
		aria-busy="true"
		aria-label="Loading"
	>
		{skeletonKeys(count).map((key) => (
			<div key={key} className="shrink-0" style={{ width: "7.5rem" }}>
				<CardSkeleton />
			</div>
		))}
	</div>
);

/** Mirrors `Shelf`: title row, then a horizontal strip of fixed-width cards. */
export const ShelfSkeleton: React.FC = () => (
	<section className="mb-6">
		<div className={cn(SKELETON_BLOCK, "mb-3 h-4 w-32")} />
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
