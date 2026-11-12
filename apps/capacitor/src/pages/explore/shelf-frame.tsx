import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useId, useRef } from "react";
import { useHasFinePointer, useStripScroll } from "./strip-scroll";

type Props = {
	title: string;
	onSeeAll?: () => void;
	/** Extra header buttons, left of See all (e.g. shuffle). */
	actions?: React.ReactNode;
	/** Wraps the items into a grid in place of the strip; See all then reads Show less. */
	isExpanded?: boolean;
	/** Replaces the strip, e.g. a skeleton or an error. */
	body?: React.ReactNode;
	/** `<li>` items: the strip is a list. */
	children?: React.ReactNode;
	testId?: string;
};

/** Titled horizontal strip with See all; arrows appear for pointer devices. */
const ShelfFrame: React.FC<Props> = ({
	title,
	onSeeAll,
	isExpanded,
	actions,
	body,
	children,
	testId,
}) => {
	const stripRef = useRef<HTMLUListElement>(null);
	const titleId = useId();
	const hasFinePointer = useHasFinePointer();
	const scroll = useStripScroll(stripRef);

	return (
		<section className="mb-6" data-testid={testId}>
			{/* Wraps: at a large font scale the title takes its own line rather than truncate.
			    min-h-7 is See all's height, so the header keeps one height with or without it. */}
			<header className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-2">
				<h2
					id={titleId}
					className="m-0 min-w-0 flex-[1_1_8rem] break-words font-semibold text-[0.95rem]"
				>
					{title}
				</h2>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					{actions}
					{hasFinePointer && !body && !isExpanded && (
						<>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => scroll(-1)}
								aria-label={`Scroll ${title} left`}
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => scroll(1)}
								aria-label={`Scroll ${title} right`}
							>
								<ChevronRight />
							</Button>
						</>
					)}
					{onSeeAll && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onSeeAll}
							aria-expanded={isExpanded === undefined ? undefined : isExpanded}
						>
							{isExpanded ? "Show less" : "See all"}
							{!isExpanded && <ChevronRight />}
						</Button>
					)}
				</div>
			</header>
			{body ?? (
				<ul
					ref={stripRef}
					// Safari drops the list role of a list-style:none list without it.
					// biome-ignore lint/a11y/noRedundantRoles: see comment above
					role="list"
					aria-labelledby={titleId}
					className={
						isExpanded
							? "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 p-0 pb-2"
							: `m-0 flex list-none gap-3 p-0 pb-2 ${HIDDEN_SCROLLBAR_X}`
					}
					style={isExpanded ? undefined : { scrollSnapType: "x mandatory" }}
				>
					{children}
				</ul>
			)}
		</section>
	);
};

/**
 * A horizontal scroller without a scrollbar. The app-wide 8px scrollbar appears
 * only once content overflows, so a strip grew by 8px when its items loaded.
 */
export const HIDDEN_SCROLLBAR_X =
	"overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const SHELF_ITEM_STYLE = { width: "7.5rem", scrollSnapAlign: "start" } as const;

export default ShelfFrame;
