import { useLayoutEffect, useRef, useState } from "react";
import { BrowseController, type BrowseControllerOpts } from "./browse-controller";

type Deps = Omit<BrowseControllerOpts, "onAnchorChange" | "now">;

/** One `BrowseController` per reader mount; `anchor` mirrors it for rendering. */
export function useBrowseMode(deps: Deps): { anchor: number | null; controller: BrowseController } {
	const [anchor, setAnchor] = useState<number | null>(null);
	const depsRef = useRef(deps);
	// Not during render: a discarded transition render must not leave the
	// controller writing through another book's callbacks.
	useLayoutEffect(() => {
		depsRef.current = deps;
	});
	const [controller] = useState(
		() =>
			new BrowseController({
				getLastWord: () => depsRef.current.getLastWord(),
				getPersistedWord: () => depsRef.current.getPersistedWord(),
				isRsvp: () => depsRef.current.isRsvp(),
				writePosition: (word) => depsRef.current.writePosition(word),
				showUnsavedMove: (word) => depsRef.current.showUnsavedMove(word),
				getSession: () => depsRef.current.getSession(),
				notifyAutoCommit: (word, undo) => depsRef.current.notifyAutoCommit(word, undo),
				onAnchorChange: setAnchor,
			}),
	);
	return { anchor, controller };
}
