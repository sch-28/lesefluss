import type * as React from "react";

import { cn } from "../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
				className,
			)}
			{...props}
		/>
	);
}

function focusInputOnPadTap(e: MouseEvent) {
	(e.currentTarget as HTMLElement).parentElement
		?.querySelector<HTMLElement>("input, textarea")
		?.focus();
}

function listenForPadTaps(el: HTMLSpanElement | null) {
	el?.addEventListener("click", focusInputOnPadTap);
	return () => el?.removeEventListener("click", focusInputOnPadTap);
}

/**
 * An <input> can't draw a ::before, so on touch this wrapper adds 6px above and
 * below a 32px input (negative margins keep the layout) and focuses the input on
 * a tap there. Taller wrappers that already pad the input pass their own padding.
 * Where a tap target sits closer than 6px, the caller adds that space on touch.
 *
 * The pad is its own leaf element with a native click listener: Chromium's touch
 * adjustment only lands on such a node, and otherwise snaps a tap on the pad to a
 * nearby button (React's root-delegated onClick does not count).
 */
function InputHitArea({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			data-slot="input-hit-area"
			className={cn(
				"pointer-coarse:relative pointer-coarse:isolate pointer-coarse:-my-1.5 pointer-coarse:py-1.5",
				className,
			)}
		>
			<span
				ref={listenForPadTaps}
				aria-hidden="true"
				className="pointer-coarse:absolute pointer-coarse:inset-0 pointer-coarse:-z-10 pointer-coarse:block hidden"
			/>
			{children}
		</div>
	);
}

export { Input, InputHitArea };
