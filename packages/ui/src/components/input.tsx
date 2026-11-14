import type * as React from "react";

import { cn } from "../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * An <input> can't draw a ::before, so on touch this wrapper adds 6px above and
 * below a 32px input (negative margins keep the layout) and focuses the input on
 * a tap there. Taller wrappers that already pad the input pass their own padding.
 */
function InputHitArea({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			data-slot="input-hit-area"
			className={cn("pointer-coarse:-my-1.5 pointer-coarse:py-1.5", className)}
			onClick={(e) => {
				if (e.target !== e.currentTarget) return;
				e.currentTarget.querySelector<HTMLElement>("input, textarea")?.focus();
			}}
		>
			{children}
		</div>
	);
}

export { Input, InputHitArea };
