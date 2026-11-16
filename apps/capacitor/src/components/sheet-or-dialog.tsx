import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@lesefluss/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useDesktopOverlay } from "../hooks/use-media-query";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: React.ReactNode;
	/** Beside the title, e.g. what the flow is for. */
	aside?: React.ReactNode;
	/** When false, neither a swipe, the backdrop nor Escape closes it. Default true. */
	dismissible?: boolean;
	snapPoints?: (number | string)[];
	/** Applies to the sheet only. */
	drawerClassName?: string;
	children: React.ReactNode;
};

/**
 * A flow larger than a menu: a bottom sheet on touch, a centred dialog on a wide
 * screen with a mouse (LESE-211.8). The children scroll inside either frame.
 */
export const SheetOrDialog: React.FC<Props> = ({
	open,
	onOpenChange,
	title,
	aside,
	dismissible = true,
	snapPoints,
	drawerClassName,
	children,
}) => {
	const isDesktop = useDesktopOverlay();

	if (isDesktop) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
				<DialogContent
					showCloseButton={dismissible}
					onInteractOutside={(e) => {
						if (!dismissible) e.preventDefault();
					}}
					onEscapeKeyDown={(e) => {
						if (!dismissible) e.preventDefault();
					}}
					className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0"
				>
					<DialogHeader className="gap-1 px-4 pt-5 pr-12 pb-3 text-left">
						<DialogTitle className="truncate leading-normal">{title}</DialogTitle>
						{aside && <div className="truncate text-muted-foreground text-xs">{aside}</div>}
					</DialogHeader>
					<div className="flex min-h-0 flex-1 flex-col">{children}</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer
			open={open}
			onOpenChange={onOpenChange}
			dismissible={dismissible}
			snapPoints={snapPoints}
		>
			<DrawerContent className={drawerClassName}>
				<DrawerHeader
					className={cn(aside && "flex-row items-baseline justify-between gap-3 text-left")}
				>
					<DrawerTitle className="truncate leading-normal">{title}</DrawerTitle>
					{aside && <span className="truncate text-muted-foreground text-xs">{aside}</span>}
				</DrawerHeader>
				{children}
			</DrawerContent>
		</Drawer>
	);
};
