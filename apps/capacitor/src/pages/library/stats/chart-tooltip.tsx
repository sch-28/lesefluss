import type { ReactNode } from "react";

/** Popover chrome shared by the stats line charts, so the two read as one
 *  component rather than two that happen to match. */
export function ChartTooltip({ children }: { children: ReactNode }) {
	return (
		<div
			style={{
				background: "var(--popover)",
				color: "var(--foreground)",
				border: "1px solid var(--border)",
				borderRadius: 8,
				padding: "8px 10px",
				boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
				fontSize: 12,
				// Nivo positions the tooltip absolutely, so near the plot edge the box
				// is offered whatever width is left and breaks after every word.
				whiteSpace: "nowrap",
			}}
		>
			{children}
		</div>
	);
}
