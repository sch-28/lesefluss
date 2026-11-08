import { Button } from "@lesefluss/ui/button";
import { Bookmark } from "lucide-react";
import type React from "react";

interface BookmarkRibbonProps {
	isOnScreen: boolean;
	disabled: boolean;
	onToggle: () => void;
}

/** Filled while a bookmark is on screen; a press adds one at the first word on screen or removes it. */
const BookmarkRibbon: React.FC<BookmarkRibbonProps> = ({ isOnScreen, disabled, onToggle }) => (
	<Button
		variant="ghost"
		size="icon"
		onClick={onToggle}
		disabled={disabled}
		title="Bookmark"
		aria-pressed={isOnScreen}
		className={isOnScreen ? "text-primary" : undefined}
	>
		<Bookmark className={isOnScreen ? "fill-current" : undefined} />
		<span className="sr-only">Bookmark</span>
	</Button>
);

export default BookmarkRibbon;
