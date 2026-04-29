import { IonButton, IonIcon } from "@ionic/react";
import { chevronForwardOutline } from "ionicons/icons";
import type React from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";

type Props = {
	book: Book;
	onTap: () => void;
};

/**
 * End-of-chapter "Next chapter →" button. Rendered by both the scroll-view
 * (appended after the last paragraph) and the page-view (overlaid on the
 * last page). Returns `null` when there's no next chapter to advance to,
 * so callers can drop it in unconditionally.
 *
 * Styling mirrors `ChapterStateOverlay` so terminal-state UIs (locked /
 * error / end-of-chapter) feel like one family. Layout is intentionally
 * compact — the goal is "natural scroll terminus" not "marketing CTA".
 *
 * The actual navigation logic lives in `useChapterAutoAdvance.tryAdvance`
 * (passed as `onTap`) so this component stays presentational and
 * re-entrancy-safe through the parent's existing guard.
 */
export const NextChapterFooter: React.FC<Props> = ({ book, onTap }) => {
	const { data: counts } = queryHooks.useSeriesChapterCounts();

	if (!book.seriesId || book.chapterIndex == null) return null;

	const total = counts?.get(book.seriesId);
	if (total == null || book.chapterIndex >= total - 1) return null;

	return (
		<div className="next-chapter-footer">
			<IonButton fill="outline" className="next-chapter-footer-button" onClick={onTap}>
				Next chapter
				<IonIcon slot="end" icon={chevronForwardOutline} />
			</IonButton>
		</div>
	);
};
