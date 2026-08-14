import { Button } from "@lesefluss/ui/button";
import { MoreVertical, X } from "lucide-react";
import type React from "react";
import type { UseLibrarySelection } from "./use-library-selection";

type Props = {
	selection: UseLibrarySelection;
};

/**
 * A row under the header rather than a replacement for it, so Search, Filter
 * and Sort stay usable while selecting: a selection is meant to be built across
 * several filters, which is the whole point of it surviving one.
 */
const BulkActionBar: React.FC<Props> = ({ selection }) => (
	<div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-border border-b bg-background px-3">
		<Button
			variant="ghost"
			size="icon"
			aria-label="Exit selection"
			disabled={selection.isRunning}
			onClick={selection.exit}
		>
			<X />
		</Button>
		<span className="min-w-0 flex-1 truncate font-semibold text-base">
			{selection.isRunning
				? `${selection.progress.done} of ${selection.progress.total}…`
				: `${selection.picked.length} selected`}
		</span>
		<Button
			variant="ghost"
			size="sm"
			disabled={selection.isRunning}
			onClick={selection.toggleAllVisible}
		>
			{selection.allVisibleSelected ? "None" : "All"}
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
);

export default BulkActionBar;
