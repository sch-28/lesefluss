import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";

type Props = {
	page: number;
	totalPages: number;
	onChange: (page: number) => void;
	disabled?: boolean;
};

type PageItem = number | "ellipsis-left" | "ellipsis-right";

/**
 * Classic pagination strip: 1 ... (current-1) current (current+1) ... last.
 * Always shows first + last; current sits in a 3-wide window in the middle;
 * collapses with ellipsis on whichever side needs it.
 */
function pageItems(current: number, total: number): PageItem[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

	const items: PageItem[] = [1];
	const left = Math.max(2, current - 1);
	const right = Math.min(total - 1, current + 1);

	if (left > 2) items.push("ellipsis-left");
	for (let p = left; p <= right; p++) items.push(p);
	if (right < total - 1) items.push("ellipsis-right");

	items.push(total);
	return items;
}

const Pagination: React.FC<Props> = ({ page, totalPages, onChange, disabled }) => {
	if (totalPages <= 1) return null;
	const items = pageItems(page, totalPages);

	return (
		<nav className="flex items-center justify-center gap-1 px-4 py-4" aria-label="Pagination">
			<Button
				variant="outline"
				size="icon"
				disabled={page <= 1 || disabled}
				onClick={() => onChange(page - 1)}
				aria-label="Previous page"
			>
				<ChevronLeft />
			</Button>
			{items.map((item, i) =>
				typeof item === "number" ? (
					<Button
						key={item}
						variant={item === page ? "default" : "outline"}
						size="icon"
						disabled={disabled}
						onClick={() => onChange(item)}
						aria-current={item === page ? "page" : undefined}
					>
						{item}
					</Button>
				) : (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: deterministic position
						key={`${item}-${i}`}
						className={cn("inline-flex size-8 items-center justify-center text-muted-foreground")}
						aria-hidden="true"
					>
						…
					</span>
				),
			)}
			<Button
				variant="outline"
				size="icon"
				disabled={page >= totalPages || disabled}
				onClick={() => onChange(page + 1)}
				aria-label="Next page"
			>
				<ChevronRight />
			</Button>
		</nav>
	);
};

export default Pagination;
