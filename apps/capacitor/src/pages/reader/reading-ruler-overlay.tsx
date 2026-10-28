import { useCallback, useRef } from "react";
import type { ReadingRuler } from "./reading-ruler";

/**
 * The ruler's nodes, rendered once as a direct child of the reader view, which
 * is the box its coordinates are measured against. Positions are written by
 * `ReadingRuler`, never by React. pointer-events: none, so every tap, long press
 * and link underneath behaves as without it.
 */
export function ReadingRulerOverlay({ ruler }: { ruler: ReadingRuler }) {
	const bandRef = useRef<HTMLDivElement>(null);
	const aboveRef = useRef<HTMLDivElement>(null);
	const belowRef = useRef<HTMLDivElement>(null);

	const attach = useCallback(
		(root: HTMLDivElement | null) => {
			const band = bandRef.current;
			const dimAbove = aboveRef.current;
			const dimBelow = belowRef.current;
			if (!root || !band || !dimAbove || !dimBelow) {
				ruler.attach(null, null);
				return;
			}
			ruler.attach(root.parentElement, { root, band, dimAbove, dimBelow });
		},
		[ruler],
	);

	return (
		<div ref={attach} className="reading-ruler" data-visible="false" aria-hidden="true">
			<div ref={aboveRef} className="reading-ruler-dim" />
			<div ref={bandRef} className="reading-ruler-band" />
			<div ref={belowRef} className="reading-ruler-dim" />
		</div>
	);
}
