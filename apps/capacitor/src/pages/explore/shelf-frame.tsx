import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useRef, useSyncExternalStore } from "react";

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
	/** Replaces the strip, e.g. a skeleton or an error. */
	body?: React.ReactNode;
	children?: React.ReactNode;
	testId?: string;
};

/** Titled horizontal strip with See all; arrows appear for pointer devices. */
const ShelfFrame: React.FC<Props> = ({ title, onSeeAll, actions, body, children, testId }) => {
	const stripRef = useRef<HTMLDivElement>(null);
	const hasFinePointer = useHasFinePointer();
	const scroll = (direction: 1 | -1) => {
		const el = stripRef.current;
		el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
	};

	return (
		<section className="mb-6" data-testid={testId}>
			<header className="mb-2 flex items-center justify-between gap-2">
				<h2 className="m-0 min-w-0 truncate font-semibold text-[0.95rem]">{title}</h2>
				<div className="flex shrink-0 items-center gap-1">
					{actions}
					{hasFinePointer && !body && (
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
						<Button variant="ghost" size="sm" onClick={onSeeAll}>
							See all
							<ChevronRight />
						</Button>
					)}
				</div>
			</header>
			{body ?? (
				<div
					ref={stripRef}
					className="flex gap-3 overflow-x-auto pb-2"
					style={{ scrollSnapType: "x mandatory" }}
				>
					{children}
				</div>
			)}
		</section>
	);
};

export const SHELF_ITEM_STYLE = { width: "7.5rem", scrollSnapAlign: "start" } as const;

export default ShelfFrame;
