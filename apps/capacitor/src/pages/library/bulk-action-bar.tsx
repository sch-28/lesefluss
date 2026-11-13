import { Button } from "@lesefluss/ui/button";
import { MoreVertical, X } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { tabBarHidden } from "../../components/app-shell/tab-bar-visibility";
import type { UseLibrarySelection } from "./use-library-selection";

type Props = {
	selection: UseLibrarySelection;
};

/**
 * On a phone it takes the tab bar's place; on desktop it floats over the
 * grid. Search, filters and sort stay usable above it: a selection is meant
 * to be built across several filters, which is the point of it surviving one.
 */
const BulkActionBar: React.FC<Props> = ({ selection }) => {
	useEffect(() => {
		tabBarHidden.set(true);
		return () => tabBarHidden.set(false);
	}, []);

	return (
		<div
			role="toolbar"
			aria-label="Selection"
			data-toast-clear
			className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)] md:inset-x-auto md:bottom-6 md:left-[calc(50%+var(--side-nav-w)/2)] md:-translate-x-1/2 md:rounded-xl md:border md:pb-0 md:shadow-lg"
		>
			<div className="flex h-[var(--tab-bar-h)] items-center gap-1 px-2 md:h-12 md:gap-2">
				<Button variant="ghost" size="sm" disabled={selection.isRunning} onClick={selection.exit}>
					<X />
					Done
				</Button>
				<span className="min-w-0 flex-1 truncate px-1 font-semibold text-sm md:min-w-28">
					{selection.isRunning
						? `${selection.progress.done} of ${selection.progress.total}…`
						: `${selection.picked.length} selected`}
				</span>
				<Button
					variant="ghost"
					size="sm"
					disabled={selection.isRunning || selection.visibleCount === 0}
					onClick={selection.toggleAllVisible}
				>
					{selection.allVisibleSelected ? "Deselect all" : `Select all ${selection.visibleCount}`}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Bulk actions"
					disabled={selection.picked.length === 0 || selection.isRunning}
					onClick={() => selection.openSheet("actions")}
				>
					<MoreVertical />
				</Button>
			</div>
		</div>
	);
};

export default BulkActionBar;
