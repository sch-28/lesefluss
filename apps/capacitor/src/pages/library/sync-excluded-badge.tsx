import { isSyncEligible } from "@lesefluss/core";
import { CloudOff } from "lucide-react";
import type React from "react";
import { useSyncContext } from "../../contexts/sync-context";
import type { Book } from "../../services/db/schema";

/**
 * Compact marker for a book excluded from cloud sync because it's too large.
 * Renders nothing when logged out or when the book is sync-eligible. The
 * book-detail page shows the fuller explanation; this is the at-a-glance cue.
 */
export const SyncExcludedBadge: React.FC<{ book: Book; className?: string }> = ({
	book,
	className,
}) => {
	const { isLoggedIn } = useSyncContext();
	if (!isLoggedIn || isSyncEligible(book)) return null;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-[0.65rem] text-amber-700 dark:text-amber-400 ${className ?? ""}`}
		>
			<CloudOff className="size-3" />
			Local only
		</span>
	);
};
