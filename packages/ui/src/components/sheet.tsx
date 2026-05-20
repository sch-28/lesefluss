import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
	return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:[animation-duration:240ms] data-[state=closed]:[animation-duration:200ms] data-[state=open]:[animation-timing-function:cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:[animation-timing-function:cubic-bezier(0.32,0.72,0,1)]",
				className,
			)}
			{...props}
		/>
	);
}

type SheetSide = "top" | "right" | "bottom" | "left";

function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	showHandle = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: SheetSide;
	showCloseButton?: boolean;
	/** Pill-shaped drag indicator for bottom/top sheets. */
	showHandle?: boolean;
}) {
	const isBottom = side === "bottom";
	const isTop = side === "top";
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				className={cn(
					"fixed z-50 flex flex-col gap-0 bg-popover text-popover-foreground shadow-2xl outline-none",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=open]:[animation-duration:320ms] data-[state=closed]:[animation-duration:220ms]",
					"data-[state=open]:[animation-timing-function:cubic-bezier(0.32,0.72,0,1)]",
					"data-[state=closed]:[animation-timing-function:cubic-bezier(0.32,0.72,0,1)]",
					side === "right" &&
						"data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right inset-y-0 right-0 h-full w-3/4 border-border border-l sm:max-w-sm",
					side === "left" &&
						"data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left inset-y-0 left-0 h-full w-3/4 border-border border-r sm:max-w-sm",
					isTop &&
						"data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top inset-x-0 top-0 rounded-b-2xl pt-[env(safe-area-inset-top)]",
					isBottom &&
						"data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
					className,
				)}
				{...props}
			>
				{(isBottom || isTop) && showHandle && (
					<div className={cn("flex w-full justify-center", isBottom ? "pt-2 pb-1" : "pt-1 pb-2")}>
						<span aria-hidden className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
					</div>
				)}
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/50">
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1 px-5 pt-3 pb-2", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto flex flex-col gap-2 p-4", className)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("font-semibold text-base text-foreground", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetOverlay,
	SheetPortal,
	SheetTitle,
	SheetTrigger,
};
