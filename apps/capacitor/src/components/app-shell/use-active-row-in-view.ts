import { useLayoutEffect, useRef } from "react";

/** Scrolls a sidebar list just enough to show its active row: when the active row or the row
 *  count changes, and when the list resizes as the sections around it load. Only the list
 *  scrolls, never a container around it. */
export function useActiveRowInView(activeKey: string | undefined | null, rowCount: number) {
	const listRef = useRef<HTMLUListElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-runs when the active row or the rows change
	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list || activeKey == null) return;
		const reveal = () => {
			const row = list.querySelector('[data-active="true"]');
			if (!row) return;
			const listBox = list.getBoundingClientRect();
			const rowBox = row.getBoundingClientRect();
			if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
			else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom;
		};
		reveal();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(reveal);
		observer.observe(list);
		return () => observer.disconnect();
	}, [activeKey, rowCount]);
	return listRef;
}
