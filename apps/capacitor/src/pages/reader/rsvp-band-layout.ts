import { useLayoutEffect } from "react";

/** How the side buttons sit beside the control card: labelled, icon only, or as icons in a row above it. */
export type PillFit = "labels" | "icons" | "above";

const PILL_PX = 44;

/** The card is centred, so each side button gets half of what the card leaves, less the gap to it. */
export function pillFit(
	bandWidth: number,
	cardWidth: number,
	widestLabelledPill: number,
	gap: number,
): PillFit {
	const side = (bandWidth - cardWidth) / 2 - gap;
	if (side >= widestLabelledPill) return "labels";
	if (side >= PILL_PX) return "icons";
	return "above";
}

/**
 * Fits the paused band's side buttons beside the card (`data-pills` on `.rsvp-band`) and
 * measures how much of the view the band takes into `--rsvp-band-space`, which places the
 * word. The value stays on the display while playing, so the word holds still.
 */
export function useRsvpBandLayout(
	containerRef: React.RefObject<HTMLDivElement | null>,
	isPaused: boolean,
): void {
	useLayoutEffect(() => {
		const container = containerRef.current;
		const band = container?.querySelector<HTMLElement>(".rsvp-band");
		const card = band?.querySelector<HTMLElement>(".rsvp-controls");
		const inner = container?.querySelector(".rsvp-display-inner");
		// The overlay assumes a one-line progress bar; a chapter line makes it taller.
		const bar = container?.parentElement?.querySelector<HTMLElement>(
			":scope > .reader-progress-bar",
		);
		if (!isPaused || !container || !band || !card || !inner) return;
		const measure = () => {
			const innerBottom = inner.getBoundingClientRect().bottom;
			const overlap = bar ? Math.max(0, innerBottom - bar.getBoundingClientRect().top) : 0;
			container.style.setProperty("--rsvp-bar-overlap", `${overlap}px`);
			// Labels on first, so their natural widths are measured whatever fit was set before.
			band.dataset.pills = "labels";
			const pills = [...band.querySelectorAll<HTMLElement>(".rsvp-pill-stack > button")];
			const widest = Math.max(PILL_PX, ...pills.map((pill) => pill.offsetWidth));
			const gap = Number.parseFloat(getComputedStyle(band).columnGap) || 0;
			band.dataset.pills = pillFit(band.clientWidth, card.offsetWidth, widest, gap);
			const space = innerBottom - band.getBoundingClientRect().top;
			container.style.setProperty("--rsvp-band-space", `${Math.max(0, space)}px`);
		};
		measure();
		const observer = new ResizeObserver(measure);
		for (const el of [container, band, card, bar]) if (el) observer.observe(el);
		return () => observer.disconnect();
	}, [containerRef, isPaused]);
}
