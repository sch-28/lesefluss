import { IonIcon } from "@ionic/react";
import { chevronBackOutline, chevronForwardOutline } from "ionicons/icons";
import type React from "react";

type Props = {
	page: number;
	totalPages: number;
	onChange: (page: number) => void;
	disabled?: boolean;
};

type PageItem = number | "ellipsis-left" | "ellipsis-right";

/**
 * Build a classic pagination strip: 1 … (current-1) current (current+1) … last.
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
		<nav className="pagination" aria-label="Pagination">
			<button
				type="button"
				className="pagination-btn"
				disabled={page <= 1 || disabled}
				onClick={() => onChange(page - 1)}
				aria-label="Previous page"
			>
				<IonIcon icon={chevronBackOutline} />
			</button>
			{items.map((item, i) =>
				typeof item === "number" ? (
					<button
						type="button"
						key={item}
						className={item === page ? "pagination-btn active" : "pagination-btn"}
						disabled={disabled}
						onClick={() => onChange(item)}
						aria-current={item === page ? "page" : undefined}
					>
						{item}
					</button>
				) : (
					<span key={`${item}-${i}`} className="pagination-ellipsis" aria-hidden="true">
						…
					</span>
				),
			)}
			<button
				type="button"
				className="pagination-btn"
				disabled={page >= totalPages || disabled}
				onClick={() => onChange(page + 1)}
				aria-label="Next page"
			>
				<IonIcon icon={chevronForwardOutline} />
			</button>
		</nav>
	);
};

export default Pagination;
