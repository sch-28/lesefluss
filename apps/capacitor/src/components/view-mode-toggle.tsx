import { Button } from "@lesefluss/ui/button";
import { LayoutGrid, List } from "lucide-react";
import type React from "react";

export type ViewMode = "grid" | "list";

export const ViewModeToggle: React.FC<{ viewMode: ViewMode; onToggle: () => void }> = ({
	viewMode,
	onToggle,
}) => (
	<Button
		variant="ghost"
		size="icon"
		onClick={onToggle}
		aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
	>
		{viewMode === "grid" ? <List /> : <LayoutGrid />}
	</Button>
);
