import { Button } from "@lesefluss/ui/button";
import { Bookmark } from "lucide-react";
import type React from "react";
import { withKey } from "../../commands/keys";
import { useCommandKey } from "../../commands/registry";

interface BookmarkRibbonProps {
	isOnScreen: boolean;
	disabled: boolean;
	onToggle: () => void;
}

/** Filled while a bookmark is on screen; a press adds one at the first word on screen or removes it. */
const BookmarkRibbon: React.FC<BookmarkRibbonProps> = ({ isOnScreen, disabled, onToggle }) => {
	const label = isOnScreen ? "Remove bookmark here" : "Bookmark here";
	const key = useCommandKey("reader.bookmark");
	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={onToggle}
			disabled={disabled}
			title={withKey(label, key)}
			aria-pressed={isOnScreen}
			className={isOnScreen ? "text-primary" : undefined}
		>
			<Bookmark className={isOnScreen ? "fill-current" : undefined} />
			<span className="sr-only">Bookmark</span>
		</Button>
	);
};

export default BookmarkRibbon;
