import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** A settings action that is neither a row nor a page button: Reset spacing, Reset RSVP settings, Open full settings. */
export const TextAction: React.FC<{
	onClick: () => void;
	/** "link" goes somewhere; the default acts in place. */
	tone?: "action" | "link";
	children: React.ReactNode;
}> = ({ onClick, tone = "action", children }) => (
	<button
		type="button"
		onClick={onClick}
		className={cn(
			"min-h-11 px-1 text-sm underline underline-offset-4 transition-colors",
			tone === "link" ? "text-primary" : "text-muted-foreground hover:text-foreground",
		)}
	>
		{children}
	</button>
);
