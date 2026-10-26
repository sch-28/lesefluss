import { useEffect, useState } from "react";
import { loadReaderFont, type ReaderFont } from "./reader-font";

/**
 * The reader font once it has loaded: null until the first one has, then the
 * previous font until the next one has. A layout measured in the fallback face
 * paginates and anchors on text that is about to reflow. `family` is null while
 * the settings that name it are still loading.
 */
export function useLoadedReaderFont(family: string | null, isBold: boolean): ReaderFont | null {
	const [loaded, setLoaded] = useState<ReaderFont | null>(null);
	useEffect(() => {
		if (family === null) return;
		let isCancelled = false;
		void loadReaderFont(family).then(() => {
			if (!isCancelled) setLoaded({ family, isBold });
		});
		return () => {
			isCancelled = true;
		};
	}, [family, isBold]);
	return loaded;
}
