import { useBackHandler } from "../../hooks/use-back-handler";

/**
 * Android back leaves a selection, then RSVP or browse, before it leaves the book.
 * RSVP goes through the toggle's own exit; browse goes back like 'Back to N%' and
 * never saves the browsed spot.
 */
export function useReaderBack({
	isSelecting,
	isRsvp,
	isBrowsing,
	cancelSelection,
	leaveRsvp,
	browseBack,
}: {
	isSelecting: boolean;
	isRsvp: boolean;
	isBrowsing: boolean;
	cancelSelection: () => void;
	leaveRsvp: () => void;
	browseBack: () => void;
}): void {
	useBackHandler(isSelecting || isRsvp || isBrowsing, () => {
		if (isSelecting) cancelSelection();
		else if (isRsvp) leaveRsvp();
		else browseBack();
	});
}
