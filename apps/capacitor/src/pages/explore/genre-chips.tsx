import { IonChip, IonIcon, IonLabel } from "@ionic/react";
import { closeOutline } from "ionicons/icons";
import type React from "react";

type Props = {
	activeGenre: string | null;
	activeLabel?: string;
	onClear: () => void;
};

/**
 * Narrow row shown above the search results while a genre filter is active.
 * Tapping the × removes the filter and returns to landing (if there's no query).
 */
const GenreChips: React.FC<Props> = ({ activeGenre, activeLabel, onClear }) => {
	if (!activeGenre) return null;
	return (
		<div className="flex items-center gap-2 px-4 pt-2 pb-1">
			<IonChip onClick={onClear}>
				<IonLabel>{activeLabel ?? activeGenre}</IonLabel>
				<IonIcon icon={closeOutline} />
			</IonChip>
		</div>
	);
};

export default GenreChips;
