import { Button } from "@lesefluss/ui/button";
import { LayoutGrid, List, Table2 } from "lucide-react";
import type React from "react";

export type ViewMode = "grid" | "list";

const ICONS = { grid: LayoutGrid, list: List, table: Table2 };

type Props = {
	viewMode: ViewMode | "table";
	/** The view a press switches to; the other of grid and list when unset. */
	next?: ViewMode | "table";
	onToggle: () => void;
};

export const ViewModeToggle: React.FC<Props> = ({ viewMode, next, onToggle }) => {
	const target = next ?? (viewMode === "grid" ? "list" : "grid");
	const Icon = ICONS[target];
	return (
		<Button variant="ghost" size="icon" onClick={onToggle} aria-label={`Switch to ${target} view`}>
			<Icon />
		</Button>
	);
};
