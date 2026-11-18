import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { type RefObject, useLayoutEffect, useRef } from "react";

/** First-paint fallback for a page empty state's height before useFillFreeHeight measures. */
export const EMPTY_STATE_PAGE = "md:min-h-[calc(100dvh-16rem)]";

const paddingBottom = (node: Element) =>
	Number.parseFloat(getComputedStyle(node).paddingBottom) || 0;

/** Stretches the element from where it starts down to the bottom of the app's scroll area (above
 *  the tab bar, whose height that area pads off even while the bar is hidden) and cancels its
 *  parent's bottom padding, so its content sits centred in the free height whatever is above it
 *  (header, toolbars, banners) and the page does not scroll. Refits on every render and whenever
 *  the page or the window resizes, since rows can appear above it. */
export function useFillFreeHeight(ref: RefObject<HTMLDivElement | null>, on = true) {
	useLayoutEffect(() => {
		const el = ref.current;
		if (!on || !el) return;
		const scroller = el.closest<HTMLElement>(".app-scroll");
		const parent = el.parentElement;
		const refit = () => {
			const bottom = scroller
				? scroller.getBoundingClientRect().bottom - paddingBottom(scroller)
				: window.innerHeight;
			const inPage = parent && parent !== scroller;
			el.style.marginBottom = inPage ? `${-paddingBottom(parent)}px` : "";
			// The free height starts right under the visible block above it (or the parent's top),
			// so padding and margins in between count as free space too.
			el.style.marginTop = "";
			if (inPage) {
				let above = el.previousElementSibling;
				while (above && above.getBoundingClientRect().height === 0) {
					above = above.previousElementSibling;
				}
				const start = (above ?? parent).getBoundingClientRect()[above ? "bottom" : "top"];
				const gap = el.getBoundingClientRect().top - start;
				const margin = Number.parseFloat(getComputedStyle(el).marginTop) || 0;
				if (gap > 0) el.style.marginTop = `${margin - gap}px`;
			}
			el.style.minHeight = `${Math.max(0, bottom - el.getBoundingClientRect().top)}px`;
		};
		refit();
		let pageRoot: HTMLElement = el;
		while (pageRoot.parentElement && pageRoot.parentElement !== scroller) {
			pageRoot = pageRoot.parentElement;
		}
		const observer = new ResizeObserver(refit);
		observer.observe(pageRoot);
		if (parent) observer.observe(parent);
		window.addEventListener("resize", refit);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", refit);
			el.style.marginBottom = "";
			el.style.marginTop = "";
			el.style.minHeight = "";
		};
	});
}

/** A block that takes the page's free height (see useFillFreeHeight), for a page whose empty
 *  state shares the space with something above it. */
export const FillFreeHeight: React.FC<{ className?: string; children: React.ReactNode }> = ({
	className,
	children,
}) => {
	const ref = useRef<HTMLDivElement>(null);
	useFillFreeHeight(ref);
	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	);
};

/** The one empty (or gone) view: an icon, a title, a line of help and the way to fill it. */
export const EmptyState: React.FC<
	{
		icon?: React.ComponentType<{ className?: string }>;
		title?: string;
		children?: React.ReactNode;
		/** The ways to fill the empty view, under the text. */
		action?: React.ReactNode;
		/** The page's only content: centre it in the free height (see EMPTY_STATE_PAGE). */
		page?: boolean;
		className?: string;
	} & Pick<React.HTMLAttributes<HTMLDivElement>, "role"> & {
			"data-testid"?: string;
			"data-error-kind"?: string;
		}
> = ({ icon: Icon, title, children, action, page, className, ...rest }) => {
	const ref = useRef<HTMLDivElement>(null);
	useFillFreeHeight(ref, !!page);
	return (
		<div
			ref={ref}
			className={cn(
				"flex flex-col items-center justify-center gap-3 px-8 pb-8 text-center",
				// Inline it keeps its distance from the block above; as a page's first block PageBody
				// drops the margin, so it starts at the frame's content gap.
				page ? ["pt-8", EMPTY_STATE_PAGE] : "mt-8",
				className,
			)}
			data-empty-state={page ? "page" : "inline"}
			{...rest}
		>
			{Icon && <Icon className="size-8 text-muted-foreground" />}
			{(title || children) && (
				<div className="flex max-w-sm flex-col gap-1">
					{title && <h2 className="m-0 font-semibold text-base text-foreground">{title}</h2>}
					{children && <p className="m-0 text-muted-foreground text-sm">{children}</p>}
				</div>
			)}
			{action && <div className="mt-2 flex flex-col items-center gap-2">{action}</div>}
		</div>
	);
};
