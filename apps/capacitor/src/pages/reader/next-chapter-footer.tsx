import { IonButton, IonIcon } from "@ionic/react";
import { chevronBackOutline, chevronForwardOutline } from "ionicons/icons";
import type React from "react";

type Props = {
	hasPrev: boolean;
	hasNext: boolean;
	onNext: () => void;
	onPrev: () => void;
};

/**
 * End-of-chapter previous/next navigation rendered after the last paragraph
 * (scroll view) or overlaid on the last page (page view). Boundary handling
 * is left to the caller: pass `hasPrev=false` on chapter 0 and `hasNext=false`
 * on the last chapter (or while the chapter-counts query is still loading) to
 * hide the respective button. Returns `null` when both are false.
 */
export const NextChapterFooter: React.FC<Props> = ({ hasPrev, hasNext, onNext, onPrev }) => {
	if (!hasPrev && !hasNext) return null;

	return (
		<div className="next-chapter-footer">
			{hasPrev && (
				<IonButton fill="outline" onClick={onPrev}>
					<IonIcon slot="start" icon={chevronBackOutline} />
					Previous
				</IonButton>
			)}
			{hasNext && (
				<IonButton fill="outline" onClick={onNext}>
					Next
					<IonIcon slot="end" icon={chevronForwardOutline} />
				</IonButton>
			)}
		</div>
	);
};
