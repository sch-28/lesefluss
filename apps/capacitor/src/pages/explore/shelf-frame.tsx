import { Button } from "@lesefluss/ui/button";
import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useId, useRef, useSyncExternalStore } from "react";

const FINE_POINTER = "(pointer: fine)";

function subscribePointer(onChange: () => void) {
	const mq = window.matchMedia?.(FINE_POINTER);
	mq?.addEventListener("change", onChange);
	return () => mq?.removeEventListener("change", onChange);
}

/** True with a mouse or trackpad, where a horizontal strip has no swipe to scroll it. */
function useHasFinePointer(): boolean {
	return useSyncExternalStore(
		subscribePointer,
		() => window.matchMedia?.(FINE_POINTER).matches ?? false,
		() => false,
	);
}

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
	const isReducedMotion = usePrefersReducedMotion();
	const scroll = (direction: 1 | -1) => {
		const el = stripRef.current;
		el?.scrollBy({
			left: direction * el.clientWidth * 0.8,
			behavior: isReducedMotion ? "auto" : "smooth",
		});
	};

	return (
		<section className="mb-6" data-testid={testId}>
			{/* Wraps: at a large font scale the title takes its own line rather than truncate. */}
			<header className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
					aria-labelledby={titleId}
					className={
						isExpanded
							? "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 p-0 pb-2"
							: "m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2"
					}
					style={isExpanded ? undefined : { scrollSnapType: "x mandatory" }}
				>
					{children}
				</ul>
			)}
		</section>
	);
};

export const SHELF_ITEM_STYLE = { width: "7.5rem", scrollSnapAlign: "start" } as const;

export default ShelfFrame;
