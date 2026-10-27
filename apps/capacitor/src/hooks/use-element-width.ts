import { type RefObject, useLayoutEffect, useState } from "react";

/** The element's border-box width, kept current; 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		setWidth(el.getBoundingClientRect().width);
		const observer = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return width;
}
