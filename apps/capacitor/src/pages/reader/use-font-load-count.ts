import { useEffect, useState } from "react";
import { hasLoadedFace } from "./reader-font";

/**
 * Counts loads of the reader font's faces. One that lands after the layout (a
 * latin-ext subset a later paragraph needs) reflows the text without resizing
 * anything, so the layout keys take the count. Other faces (the font picker's
 * labels, the app's UI font) don't touch the reader's text and aren't counted.
 */
export function useFontLoadCount(face: string | undefined): number {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const fonts = document.fonts;
		if (!fonts || !face) return;
		const onLoaded = (event: Event) => {
			if (hasLoadedFace(event, face)) setCount((n) => n + 1);
		};
		fonts.addEventListener("loadingdone", onLoaded);
		return () => fonts.removeEventListener("loadingdone", onLoaded);
	}, [face]);
	return count;
}
