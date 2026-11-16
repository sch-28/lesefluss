import { useEffect } from "react";
import type { NavigateEmitter } from "../reader/reader-api/legacy-adapter";

type Options = {
	takeover: (word: number) => void;
	navigateEmitter: NavigateEmitter;
	browseAnchor: number | null;
	/** The reader is saving the mini's own word: not a move of its own. */
	isMiniSave: () => boolean;
	isReconcilingJump: () => boolean;
};

/** The reader moving on its own pauses the mini at the reader's word. */
export function useMiniTakeover({
	takeover,
	navigateEmitter,
	browseAnchor,
	isMiniSave,
	isReconcilingJump,
}: Options): void {
	useEffect(
		() =>
			navigateEmitter.subscribe((word, source) => {
				if (isMiniSave()) return;
				// The follow's own scroll reconciling, not the reader moving.
				if (source === "settle" && isReconcilingJump()) return;
				takeover(word);
			}),
		[navigateEmitter, takeover, isMiniSave, isReconcilingJump],
	);
	// Entering browse needn't save (the anchor may already be the saved word), so it has no emit to take over on.
	useEffect(() => {
		if (browseAnchor !== null) takeover(browseAnchor);
	}, [browseAnchor, takeover]);
}
