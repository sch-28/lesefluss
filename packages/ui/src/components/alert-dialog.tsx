import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type * as React from "react";

import { useOverlayBack, useOverlayOpen } from "../lib/overlay-back";
import { cn } from "../lib/utils";
import { buttonVariants } from "./button";

function AlertDialog({
	open,
	defaultOpen,
	onOpenChange,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
	const [isOpen, setOpen] = useOverlayOpen(open, defaultOpen, onOpenChange);
	useOverlayBack(isOpen, () => setOpen(false));
	return (
		<AlertDialogPrimitive.Root
			data-slot="alert-dialog"
			open={isOpen}
			onOpenChange={setOpen}
			{...props}
		/>
	);
}

function AlertDialogTrigger({
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
	return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
	return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
	return (
		<AlertDialogPrimitive.Overlay
			data-slot="alert-dialog-overlay"
			className={cn(
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=open]:animate-in dark:bg-black/60 data-[state=closed]:[animation-duration:160ms] data-[state=open]:[animation-duration:200ms]",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPrimitive.Content
				data-slot="alert-dialog-content"
				className={cn(
					"fixed top-[50%] left-[50%] z-50 grid w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl outline-none",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=open]:animate-in",
					"data-[state=closed]:[animation-duration:160ms] data-[state=open]:[animation-duration:200ms]",
					"data-[state=closed]:[animation-timing-function:cubic-bezier(0.7,0,0.84,0)] data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)]",
					"sm:max-w-lg",
					className,
				)}
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-header"
			className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
			{...props}
		/>
	);
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-footer"
			className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogPrimitive.Title
			data-slot="alert-dialog-title"
			className={cn("font-semibold text-lg", className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	variant = "default",
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
	variant?: "default" | "destructive";
}) {
	return (
		<AlertDialogPrimitive.Action
			data-slot="alert-dialog-action"
			className={cn(buttonVariants({ variant }), className)}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
	return (
		<AlertDialogPrimitive.Cancel
			data-slot="alert-dialog-cancel"
			className={cn(buttonVariants({ variant: "outline" }), className)}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
