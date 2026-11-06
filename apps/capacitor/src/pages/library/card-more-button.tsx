import { cn } from "@lesefluss/ui/utils";
import { MoreHorizontal } from "lucide-react";
import type React from "react";

type Props = { title: string; onMenu: () => void; className?: string };

/**
 * The per-book menu's own button, since a long press now selects. A sibling of
 * the card's button, not inside it: a button cannot hold another. Always shown
 * on touch screens, on hover or focus where there is a mouse.
 */
const CardMoreButton: React.FC<Props> = ({ title, onMenu, className }) => (
	<button
		type="button"
		aria-label={`More for ${title}`}
		onClick={onMenu}
		className={cn(
			"flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm outline-none backdrop-blur-sm focus-visible:ring-3 focus-visible:ring-ring/50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
			className,
		)}
	>
		<MoreHorizontal className="size-4" />
	</button>
);

export default CardMoreButton;
