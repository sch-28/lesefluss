import { Button } from "@lesefluss/ui/button";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../components/toast";
import type { Highlight } from "../../services/db/schema";
import { exportHighlights } from "../../services/export";
import { formatRelative } from "../../utils/date-utils";
import { IS_WEB } from "../../utils/platform";
import type { HighlightColor } from "../reader/selection-toolbar";

const COLLAPSED_COUNT = 4;

const SWATCH: Record<HighlightColor, string> = {
	yellow: "bg-yellow-400",
	blue: "bg-sky-400",
	orange: "bg-orange-400",
	pink: "bg-pink-400",
};

/** Highlights inline on the book page, so they are readable outside the reader. */
export function BookHighlights({
	bookId,
	highlights,
}: {
	bookId: string;
	highlights: Highlight[];
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const { showToast } = useToast();
	const exportMutation = useMutation({
		mutationFn: () => exportHighlights({ format: "markdown", scope: { type: "book", id: bookId } }),
		onSuccess: (completed) => {
			if (completed) showToast("Highlights exported", "success");
		},
		onError: (err: Error) => showToast(err.message || "Export failed", "danger"),
	});
	if (highlights.length === 0) return null;

	const ordered = [...highlights].sort((a, b) => a.startWord - b.startWord);
	const visible = isExpanded ? ordered : ordered.slice(0, COLLAPSED_COUNT);
	const hidden = ordered.length - visible.length;

	return (
		<section className="book-detail-card mt-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="book-detail-section-title">
					Highlights <span className="font-normal opacity-50">· {highlights.length}</span>
				</h2>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => exportMutation.mutate()}
					disabled={exportMutation.isPending}
					aria-label="Export highlights as Markdown"
					className="relative -my-1 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
				>
					{exportMutation.isPending ? (
						<Loader2 className="animate-spin" />
					) : IS_WEB ? (
						<Download />
					) : (
						<Share2 />
					)}
					Export
				</Button>
			</div>
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
								<p className="m-0 mt-1.5 border-current/15 border-l-2 pl-2 text-muted-foreground text-xs italic">
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
