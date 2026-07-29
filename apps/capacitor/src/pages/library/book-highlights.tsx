import { useState } from "react";
import type { HighlightColor } from "../reader/selection-toolbar";
import type { Highlight } from "../../services/db/schema";
import { formatRelative } from "../../utils/date-utils";

const COLLAPSED_COUNT = 4;

const SWATCH: Record<HighlightColor, string> = {
	yellow: "bg-yellow-400",
	blue: "bg-sky-400",
	orange: "bg-orange-400",
	pink: "bg-pink-400",
};

/** Highlights inline on the book page, so they are readable outside the reader. */
export function BookHighlights({ highlights }: { highlights: Highlight[] }) {
	const [isExpanded, setIsExpanded] = useState(false);
	if (highlights.length === 0) return null;

	const ordered = [...highlights].sort((a, b) => a.startWord - b.startWord);
	const visible = isExpanded ? ordered : ordered.slice(0, COLLAPSED_COUNT);
	const hidden = ordered.length - visible.length;

	return (
		<section className="book-detail-card mt-4">
			<h2 className="book-detail-section-title">
				Highlights <span className="font-normal opacity-50">· {highlights.length}</span>
			</h2>
			<ul className="mt-3 space-y-3">
				{visible.map((highlight) => (
					<li key={highlight.id} className="flex gap-2.5">
						<span
							className={`mt-0.5 w-1 shrink-0 rounded-full ${SWATCH[highlight.color as HighlightColor]}`}
							aria-hidden="true"
						/>
						<div className="min-w-0 flex-1">
							{highlight.text && (
								<p className="m-0 line-clamp-4 text-sm leading-relaxed">{highlight.text}</p>
							)}
							{highlight.note && (
								<p className="mt-1.5 m-0 border-current/15 border-l-2 pl-2 text-muted-foreground text-xs italic">
									{highlight.note}
								</p>
							)}
							<p className="m-0 mt-1 text-[11px] text-muted-foreground/70">
								{formatRelative(highlight.createdAt)}
							</p>
						</div>
					</li>
				))}
			</ul>
			{hidden > 0 && (
				<button
					type="button"
					onClick={() => setIsExpanded(true)}
					className="mt-3 w-full rounded-md border border-border py-2 text-muted-foreground text-xs"
				>
					Show {hidden} more
				</button>
			)}
		</section>
	);
}
