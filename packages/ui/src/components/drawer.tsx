import type * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "../lib/utils";

declare global {
	interface Window {
		Capacitor?: { isNativePlatform?: () => boolean };
	}
}

/**
 * The native shell resizes the whole WebView when the keyboard opens
 * (`KeyboardResize.Native`), so vaul measures a layout viewport that has
 * already shrunk, memoises that as the drawer's natural height, and writes it
 * back as an inline height once the keyboard closes, stranding the sheet at
 * half size. The resize already keeps the drawer above the keyboard, so vaul's
 * repositioning has nothing to add there. Browsers still need it.
 *
 * `repositionInputs={false}` also switches off vaul's `usePreventScroll`, which
 * only ever acts on iOS. Targeting iOS means restoring background-scroll
 * prevention some other way.
 */
const isNativeShell = () =>
	typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;

function Drawer({ repositionInputs, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
	return (
		<DrawerPrimitive.Root
			data-slot="drawer"
			repositionInputs={repositionInputs ?? !isNativeShell()}
			{...props}
		/>
	);
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
	return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
	return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
	return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
	className,
	...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
	return (
		<DrawerPrimitive.Overlay
			data-slot="drawer-overlay"
			className={cn(
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in",
				className,
			)}
			{...props}
		/>
	);
}

function DrawerContent({
	className,
	children,
	showHandle = true,
	...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
	showHandle?: boolean;
}) {
	return (
		<DrawerPortal>
			<DrawerOverlay />
			<DrawerPrimitive.Content
				data-slot="drawer-content"
				className={cn(
					"group/drawer-content fixed z-50 flex h-auto flex-col bg-popover text-popover-foreground outline-none",
					"data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[85vh] data-[vaul-drawer-direction=bottom]:rounded-t-2xl data-[vaul-drawer-direction=bottom]:pb-[var(--safe-bottom)]",
					"data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[85vh] data-[vaul-drawer-direction=top]:rounded-b-2xl data-[vaul-drawer-direction=top]:pt-[var(--safe-top)]",
					"data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-border data-[vaul-drawer-direction=right]:border-l sm:data-[vaul-drawer-direction=right]:max-w-sm",
					"data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-border data-[vaul-drawer-direction=left]:border-r sm:data-[vaul-drawer-direction=left]:max-w-sm",
					className,
				)}
				{...props}
			>
				{showHandle && (
					<div
						aria-hidden
						className="mx-auto mt-2 mb-1 hidden h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 group-data-[vaul-drawer-direction=top]/drawer-content:order-last group-data-[vaul-drawer-direction=top]/drawer-content:mt-1 group-data-[vaul-drawer-direction=top]/drawer-content:mb-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:block group-data-[vaul-drawer-direction=top]/drawer-content:block"
					/>
				)}
				{children}
			</DrawerPrimitive.Content>
		</DrawerPortal>
	);
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="drawer-header"
			className={cn("flex flex-col gap-1 px-5 pt-2 pb-3", className)}
			{...props}
		/>
	);
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="drawer-footer"
			className={cn("mt-auto flex flex-col gap-2 p-4", className)}
			{...props}
		/>
	);
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
	return (
		<DrawerPrimitive.Title
			data-slot="drawer-title"
			className={cn("font-semibold text-base text-foreground", className)}
			{...props}
		/>
	);
}

function DrawerDescription({
	className,
	...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
	return (
		<DrawerPrimitive.Description
			data-slot="drawer-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

export {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
	DrawerTrigger,
};
